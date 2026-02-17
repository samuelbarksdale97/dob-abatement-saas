import { inngest } from '../client';
import { createAdminClient } from '@/lib/supabase/server';
import { parseNOIPdf, analyzePdfPages } from '@/lib/ai/gemini';
import { ParseLogger } from '@/lib/parse-logger';
import type { ParseCosts } from '@/lib/ai/schemas';

export const parseNOI = inngest.createFunction(
  {
    id: 'parse-noi-pdf',
    name: 'Parse NOI PDF',
    retries: 2,
  },
  { event: 'noi/parse.requested' },
  async ({ event, step }) => {
    const { violationId, pdfStoragePath, orgId } = event.data;
    const supabase = createAdminClient();
    const log = new ParseLogger(violationId);

    // ================================================================
    // STEP 0: Init — Mark violation as parsing (wrapped in step so it
    // only runs once, not on every Inngest re-invocation)
    // ================================================================
    await step.run('init', async () => {
      log.info('init', 'Parse pipeline started', {
        violationId,
        pdfStoragePath,
        orgId,
        event_id: event.id,
      });

      await supabase
        .from('violations')
        .update({ status: 'PARSING', parse_status: 'processing' })
        .eq('id', violationId);
    });

    // ================================================================
    // STEP 1: AI Parse — Download PDF, send to Gemini, get structured data
    // ================================================================
    const aiResult = await step.run('ai-parse', async () => {
      await log.stepStart('ai_parse', 'Downloading PDF and sending to Gemini for structured extraction');

      // Task: Download PDF from storage
      const downloadResult = await log.timed(
        'ai_parse', 'Download PDF from Supabase Storage',
        async () => supabase.storage.from('noi-pdfs').download(pdfStoragePath),
      );
      const { data: pdfData, error: downloadError } = downloadResult;

      if (downloadError || !pdfData) {
        await log.stepFail('ai_parse', `PDF download failed: ${downloadError?.message || 'No data returned'}`, {
          storage_path: pdfStoragePath,
          error_code: downloadError?.name,
        });
        throw new Error(`Failed to download PDF: ${downloadError?.message}`);
      }

      const buffer = Buffer.from(await pdfData.arrayBuffer());
      log.info('ai_parse', 'PDF downloaded', { pdf_size_bytes: buffer.length });

      // Do: Send to Gemini
      const geminiResult = await log.timed(
        'ai_parse', 'Gemini structured extraction',
        () => parseNOIPdf(buffer),
      );

      // Verify: Check extraction quality
      const v = geminiResult.meta.validation;
      const verification = {
        passed: v.has_notice_id && v.has_address && geminiResult.meta.work_order_count > 0,
        checks: [
          { name: 'notice_id present', passed: v.has_notice_id, detail: geminiResult.parsed.notice_level_data.notice_id || 'empty' },
          { name: 'respondent present', passed: v.has_respondent, detail: geminiResult.parsed.notice_level_data.respondent || 'empty' },
          { name: 'address present', passed: v.has_address, detail: geminiResult.parsed.notice_level_data.infraction_address || 'empty' },
          { name: 'date valid', passed: v.has_date, detail: geminiResult.parsed.notice_level_data.date_of_service || 'empty' },
          { name: 'fines present', passed: v.has_fines, detail: geminiResult.parsed.notice_level_data.total_fines || 'empty' },
          { name: 'work_orders found', passed: geminiResult.meta.work_order_count > 0, detail: `${geminiResult.meta.work_order_count} items` },
          { name: 'all items have codes', passed: v.all_items_have_code },
          { name: 'all items have descriptions', passed: v.all_items_have_description },
        ],
      };

      log.info('ai_parse', 'Token usage', {
        prompt_tokens: geminiResult.meta.usage.prompt_tokens,
        output_tokens: geminiResult.meta.usage.output_tokens,
        thoughts_tokens: geminiResult.meta.usage.thoughts_tokens,
        cost_usd: geminiResult.meta.usage.cost_usd,
      });

      await log.stepComplete(
        'ai_parse',
        `Extracted ${geminiResult.meta.work_order_count} violation items from ${geminiResult.meta.pdf_size_bytes} byte PDF`,
        verification,
        {
          items_found: geminiResult.meta.work_order_count,
          gemini_meta: geminiResult.meta,
          costs: { ai_parse: geminiResult.meta.usage },
        },
      );

      return geminiResult.parsed;
    });

    // ================================================================
    // STEP 2: Insert Records — Write parsed data to Supabase
    // ================================================================
    await step.run('insert-records', async () => {
      await log.stepStart('insert_records', 'Saving parsed data to database');

      const { notice_level_data, work_orders } = aiResult;

      const parseFine = (fineStr: string): number | null => {
        const cleaned = fineStr.replace(/[$,]/g, '');
        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
      };

      const parseDate = (dateStr: string): string | null => {
        if (!dateStr) return null;
        const parts = dateStr.split('/');
        if (parts.length !== 3) return null;
        const [month, day, year] = parts;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      };

      const serviceDate = parseDate(notice_level_data.date_of_service);
      let deadlineDate: string | null = null;
      if (serviceDate && work_orders.length > 0) {
        const shortestDeadline = Math.min(
          ...work_orders.map(wo => parseInt(wo.abatement_deadline) || 60),
        );
        const deadline = new Date(serviceDate);
        deadline.setDate(deadline.getDate() + shortestDeadline);
        deadlineDate = deadline.toISOString().split('T')[0];
      }

      log.info('insert_records', 'Parsed notice-level fields', {
        notice_id: notice_level_data.notice_id,
        respondent: notice_level_data.respondent,
        service_date: serviceDate,
        deadline_date: deadlineDate,
        total_fines: parseFine(notice_level_data.total_fines),
      });

      // Task: Update violation record
      const updateResult = await log.timed(
        'insert_records', 'Update violation record',
        async () => supabase
          .from('violations')
          .update({
            notice_id: notice_level_data.notice_id,
            respondent: notice_level_data.respondent,
            infraction_address: notice_level_data.infraction_address,
            date_of_service: serviceDate,
            total_fines: parseFine(notice_level_data.total_fines),
            abatement_deadline: deadlineDate,
            priority: Math.min(...work_orders.map(wo => wo.priority), 3),
            raw_ai_output: aiResult,
          })
          .eq('id', violationId),
      );
      const updateError = updateResult.error;

      if (updateError) {
        await log.stepFail('insert_records', `Violation update failed: ${updateError.message}`, {
          error_code: updateError.code,
          error_details: updateError.details,
        });
        throw new Error(`Failed to update violation: ${updateError.message}`);
      }

      // Task: Insert violation items
      const items = work_orders.map(wo => ({
        org_id: orgId,
        violation_id: violationId,
        item_number: wo.item_number,
        violation_code: wo.violation_code,
        priority: wo.priority,
        abatement_deadline: wo.abatement_deadline,
        fine: parseFine(wo.fine),
        violation_description: wo.violation_description,
        specific_location: wo.specific_location,
        floor_number: wo.floor_number,
        date_of_infraction: parseDate(wo.date_of_infraction),
        time_of_infraction: wo.time_of_infraction,
        task_description: wo.task_description,
      }));

      const insertResult = await log.timed(
        'insert_records', `Insert ${items.length} violation items`,
        async () => supabase.from('violation_items').insert(items),
      );
      const insertError = insertResult.error;

      if (insertError) {
        await log.stepFail('insert_records', `Item insert failed: ${insertError.message}`, {
          error_code: insertError.code,
          error_details: insertError.details,
          items_attempted: items.length,
        });
        throw new Error(`Failed to insert violation items: ${insertError.message}`);
      }

      // Verify: Count what was actually written
      const { count } = await supabase
        .from('violation_items')
        .select('*', { count: 'exact', head: true })
        .eq('violation_id', violationId);

      await log.stepComplete(
        'insert_records',
        `Saved ${count} violation items`,
        {
          passed: count === items.length,
          checks: [
            { name: 'violation updated', passed: !updateError },
            { name: 'items inserted', passed: !insertError, detail: `${items.length} items` },
            { name: 'count matches', passed: count === items.length, detail: `DB has ${count}, expected ${items.length}` },
          ],
        },
      );
    });

    // ================================================================
    // STEP 3: Analyze Pages — Gemini identifies evidence photos per page
    // ================================================================
    const pageAnalysis = await step.run('analyze-pages', async () => {
      await log.stepStart('analyze_pages', 'Sending PDF to Gemini for page-level analysis');

      const redownloadResult = await log.timed(
        'analyze_pages', 'Re-download PDF for page analysis',
        async () => supabase.storage.from('noi-pdfs').download(pdfStoragePath),
      );

      if (!redownloadResult.data) {
        await log.stepFail('analyze_pages', 'Failed to re-download PDF for page analysis');
        throw new Error('Failed to download PDF for page analysis');
      }

      const buffer = Buffer.from(await redownloadResult.data.arrayBuffer());

      const geminiResult = await log.timed(
        'analyze_pages', 'Gemini page-level analysis',
        () => analyzePdfPages(buffer),
      );

      log.info('analyze_pages', 'Page analysis details', {
        total_pages: geminiResult.meta.total_pages,
        evidence_photos: geminiResult.meta.evidence_photo_count,
        pages_with_codes: geminiResult.meta.pages_with_codes,
        page_summary: geminiResult.analysis.pages.map(p => ({
          page: p.page_number,
          code: p.violation_code,
          is_photo: p.is_evidence_photo,
          desc: p.description?.slice(0, 80),
        })),
      });

      log.info('analyze_pages', 'Token usage', {
        prompt_tokens: geminiResult.meta.usage.prompt_tokens,
        output_tokens: geminiResult.meta.usage.output_tokens,
        thoughts_tokens: geminiResult.meta.usage.thoughts_tokens,
        cost_usd: geminiResult.meta.usage.cost_usd,
      });

      await log.stepComplete(
        'analyze_pages',
        `Analyzed ${geminiResult.meta.total_pages} pages, found ${geminiResult.meta.evidence_photo_count} evidence photos`,
        {
          passed: geminiResult.meta.total_pages > 0,
          checks: [
            { name: 'pages detected', passed: geminiResult.meta.total_pages > 0, detail: `${geminiResult.meta.total_pages} pages` },
            { name: 'evidence photos found', passed: geminiResult.meta.evidence_photo_count > 0, detail: `${geminiResult.meta.evidence_photo_count} photos` },
          ],
        },
        {
          total_pages: geminiResult.meta.total_pages,
          gemini_page_meta: geminiResult.meta,
          costs: { analyze_pages: geminiResult.meta.usage },
        },
      );

      return geminiResult.analysis;
    });

    // ================================================================
    // STEP 4: Match Photos — Link evidence photos to violation items
    // ================================================================
    await step.run('match-photos', async () => {
      await log.stepStart('match_photos', 'Matching evidence photos to violation items by code');

      const { data: items } = await supabase
        .from('violation_items')
        .select('id, violation_code')
        .eq('violation_id', violationId);

      if (!items || items.length === 0) {
        await log.stepComplete('match_photos', 'No violation items to match photos to', {
          passed: true,
          checks: [{ name: 'items available', passed: false, detail: 'Skipped — no items in DB' }],
        });
        return;
      }

      log.info('match_photos', `Found ${items.length} items to match against`, {
        item_codes: items.map(i => i.violation_code),
      });

      let matchedCount = 0;
      let unmatchedCount = 0;
      const matchLog: Array<{ page: number; code: string; matched_item_id: string | null }> = [];

      const normalizeCode = (code: string) => code.replace(/\s+/g, ' ').trim().toLowerCase();

      for (const page of pageAnalysis.pages) {
        if (!page.is_evidence_photo || !page.violation_code) continue;

        const matchedItem = items.find(item =>
          item.violation_code && normalizeCode(item.violation_code) === normalizeCode(page.violation_code!),
        );

        matchLog.push({
          page: page.page_number,
          code: page.violation_code,
          matched_item_id: matchedItem?.id || null,
        });

        if (!matchedItem) {
          log.warn('match_photos', `No item match for page ${page.page_number} code "${page.violation_code}"`, {
            available_codes: items.map(i => i.violation_code),
          });
          unmatchedCount++;
        }

        const { error: photoError } = await supabase.from('photos').insert({
          org_id: orgId,
          violation_id: violationId,
          violation_item_id: matchedItem?.id || null,
          photo_type: 'INSPECTOR',
          storage_path: pdfStoragePath,
          file_name: `page_${page.page_number}.pdf`,
          page_number: page.page_number,
          matched_violation_code: page.violation_code,
          status: 'APPROVED',
          metadata: { description: page.description },
        });

        if (photoError) {
          log.error('match_photos', `Failed to insert photo for page ${page.page_number}: ${photoError.message}`);
        } else {
          matchedCount++;
        }
      }

      await log.stepComplete(
        'match_photos',
        `Inserted ${matchedCount} evidence photos (${unmatchedCount} unmatched codes)`,
        {
          passed: true, // Photo matching is best-effort
          checks: [
            { name: 'photos inserted', passed: matchedCount > 0, detail: `${matchedCount} photos` },
            { name: 'all codes matched', passed: unmatchedCount === 0, detail: unmatchedCount > 0 ? `${unmatchedCount} unmatched` : 'all matched' },
          ],
        },
        {
          photos_matched: matchedCount,
          photos_unmatched: unmatchedCount,
          match_details: matchLog,
        },
      );
    });

    // ================================================================
    // STEP 5: Mark Complete — Final verification
    // ================================================================
    await step.run('mark-complete', async () => {
      await log.stepStart('complete', 'Finalizing parse');

      // Final verification: check everything is populated
      const { count: itemCount } = await supabase
        .from('violation_items')
        .select('*', { count: 'exact', head: true })
        .eq('violation_id', violationId);

      const { count: photoCount } = await supabase
        .from('photos')
        .select('*', { count: 'exact', head: true })
        .eq('violation_id', violationId);

      // Read accumulated costs from parse_metadata (written by previous steps)
      const { data: violationRow } = await supabase
        .from('violations')
        .select('parse_metadata')
        .eq('id', violationId)
        .single();
      const meta = (violationRow?.parse_metadata as Record<string, unknown>) || {};
      const existingCosts = (meta.costs || {}) as ParseCosts;
      const totalCost = (existingCosts.ai_parse?.cost_usd ?? 0) + (existingCosts.analyze_pages?.cost_usd ?? 0);

      log.info('complete', 'Final counts', {
        item_count: itemCount,
        photo_count: photoCount,
        total_cost_usd: totalCost,
      });

      // Set final status — this is the authoritative status update
      await supabase
        .from('violations')
        .update({ status: 'PARSED' })
        .eq('id', violationId);

      // stepComplete will flush parse_metadata and set parse_status = 'completed'
      // (since all merged steps will be completed)
      await log.stepComplete('complete', 'Parse pipeline finished successfully', {
        passed: (itemCount ?? 0) > 0,
        checks: [
          { name: 'violation items exist', passed: (itemCount ?? 0) > 0, detail: `${itemCount} items` },
          { name: 'photos exist', passed: (photoCount ?? 0) > 0, detail: `${photoCount} photos` },
        ],
      }, {
        costs: { ...existingCosts, total_usd: totalCost },
      });
    });

    return { success: true, violationId };
  },
);
