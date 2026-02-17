import { GoogleGenAI } from '@google/genai';
import type { NOIParseResult, GeminiPageAnalysis, GeminiUsage } from './schemas';

function getClient() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
}

// Gemini 2.5 Flash pricing (per million tokens)
const PRICING = {
  input: 0.15,
  output: 0.60,
  thoughts: 0.60,
} as const;

/** Extract token usage and calculate cost from a Gemini response */
function extractUsage(response: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } }): GeminiUsage {
  const prompt = response.usageMetadata?.promptTokenCount ?? 0;
  const output = response.usageMetadata?.candidatesTokenCount ?? 0;
  const thoughts = response.usageMetadata?.thoughtsTokenCount ?? 0;
  const total = prompt + output + thoughts;
  const cost_usd = (prompt * PRICING.input + output * PRICING.output + thoughts * PRICING.thoughts) / 1_000_000;

  return {
    prompt_tokens: prompt,
    output_tokens: output,
    thoughts_tokens: thoughts,
    total_tokens: total,
    cost_usd: Math.round(cost_usd * 1_000_000) / 1_000_000, // 6 decimal places
  };
}

// ============================================================
// 1. STRUCTURED NOI EXTRACTION
// ============================================================

const EXTRACTION_PROMPT = `You are a document parser specialized in DC Department of Buildings (DOB) Notice of Infraction (NOI) documents.

Analyze this NOI PDF and extract all data into the exact JSON structure below. Read the document carefully and extract precisely what is written.

Key extraction rules:
1. The notice_id is typically formatted like "25NOIR-INS-07709" and appears near the top
2. The respondent is the property owner/LLC name
3. The infraction_address includes the full address with unit number
4. Each work order/violation item has a sequential item number
5. Violation codes follow the pattern "12-G DCMR § XXX.X"
6. Priority 1 = life/safety hazards (fire, structural, electrical), Priority 2 = significant violations, Priority 3 = minor violations
7. The "Notes:" section after each violation contains the task_description (remediation instructions)
8. Fines are in USD format like "$625.00"
9. Dates are in MM/DD/YYYY format
10. If a field cannot be found, use empty string "" for strings and 0 for numbers

Return this exact JSON structure:
{
  "notice_level_data": {
    "notice_id": "string",
    "respondent": "string",
    "infraction_address": "string",
    "date_of_service": "string (MM/DD/YYYY)",
    "total_fines": "string ($X,XXX.XX)"
  },
  "work_orders": [
    {
      "item_number": 1,
      "violation_code": "string (e.g. 12-G DCMR § 309.1)",
      "priority": 2,
      "abatement_deadline": "string (e.g. 60 Days)",
      "fine": "string ($XXX.XX)",
      "violation_description": "string",
      "specific_location": "string (e.g. Sleeping Room, Kitchen)",
      "floor_number": "string (e.g. Interior, 1st Floor)",
      "date_of_infraction": "string (MM/DD/YYYY)",
      "time_of_infraction": "string (e.g. 10:24 PM)",
      "task_description": "string (from Notes section)"
    }
  ]
}`;

/** Validation results returned alongside parsed data */
export interface FieldValidation {
  has_notice_id: boolean;
  has_respondent: boolean;
  has_address: boolean;
  has_date: boolean;
  has_fines: boolean;
  all_items_have_code: boolean;
  all_items_have_description: boolean;
}

export interface ParseNOIResponse {
  parsed: NOIParseResult;
  meta: {
    raw_response_length: number;
    model: string;
    pdf_size_bytes: number;
    work_order_count: number;
    validation: FieldValidation;
    usage: GeminiUsage;
  };
}

export async function parseNOIPdf(pdfBuffer: Buffer): Promise<ParseNOIResponse> {
  const model = 'gemini-2.5-flash';

  const response = await getClient().models.generateContent({
    model,
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'application/pdf', data: pdfBuffer.toString('base64') } },
        { text: EXTRACTION_PROMPT },
      ],
    }],
    config: { responseMimeType: 'application/json' },
  });

  const usage = extractUsage(response);

  const text = response.text;
  if (!text) {
    throw new Error('Gemini returned empty response for NOI extraction');
  }

  let parsed: NOIParseResult;
  try {
    parsed = JSON.parse(text);
  } catch (jsonErr) {
    throw new Error(
      `Gemini returned invalid JSON. ` +
      `Response length: ${text.length}. ` +
      `First 500 chars: ${text.slice(0, 500)}. ` +
      `JSON error: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`
    );
  }

  if (!parsed.notice_level_data) {
    throw new Error(
      `Missing notice_level_data. Keys returned: ${Object.keys(parsed).join(', ')}. Preview: ${text.slice(0, 300)}`
    );
  }
  if (!Array.isArray(parsed.work_orders)) {
    throw new Error(
      `Missing work_orders array. Got type: ${typeof parsed.work_orders}. Preview: ${text.slice(0, 300)}`
    );
  }

  const nld = parsed.notice_level_data;
  const validation: FieldValidation = {
    has_notice_id: !!nld.notice_id && nld.notice_id.length > 0,
    has_respondent: !!nld.respondent && nld.respondent.length > 0,
    has_address: !!nld.infraction_address && nld.infraction_address.length > 0,
    has_date: !!nld.date_of_service && /\d{2}\/\d{2}\/\d{4}/.test(nld.date_of_service),
    has_fines: !!nld.total_fines && nld.total_fines.includes('$'),
    all_items_have_code: parsed.work_orders.every(wo => !!wo.violation_code),
    all_items_have_description: parsed.work_orders.every(wo => !!wo.violation_description),
  };

  return {
    parsed,
    meta: {
      raw_response_length: text.length,
      model,
      pdf_size_bytes: pdfBuffer.length,
      work_order_count: parsed.work_orders.length,
      validation,
      usage,
    },
  };
}

// ============================================================
// 2. PAGE-LEVEL ANALYSIS (evidence photo detection)
// ============================================================

const ANALYSIS_PROMPT = `Analyze this NOI (Notice of Infraction) PDF from the DC Department of Buildings.

For each page, identify:
1. The page number (1-indexed)
2. Whether the page contains a violation detail with a specific violation code
3. The violation code if present (format: "XX-X DCMR § XXX.X")
4. A brief description of the page content
5. Whether the page contains a photo/image that could serve as evidence

Return a JSON object with a "pages" array containing an entry for each page.

Example response:
{
  "pages": [
    {"page_number": 1, "violation_code": null, "description": "Cover page with NOI header and respondent info", "is_evidence_photo": false},
    {"page_number": 2, "violation_code": "12-G DCMR § 309.1", "description": "Violation detail for damaged ceiling in sleeping room", "is_evidence_photo": false},
    {"page_number": 3, "violation_code": "12-G DCMR § 309.1", "description": "Photo showing damaged ceiling", "is_evidence_photo": true}
  ]
}`;

export interface AnalyzePagesResponse {
  analysis: GeminiPageAnalysis;
  meta: {
    raw_response_length: number;
    model: string;
    pdf_size_bytes: number;
    total_pages: number;
    evidence_photo_count: number;
    pages_with_codes: number;
    usage: GeminiUsage;
  };
}

export async function analyzePdfPages(pdfBuffer: Buffer): Promise<AnalyzePagesResponse> {
  const model = 'gemini-2.5-flash';

  const response = await getClient().models.generateContent({
    model,
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'application/pdf', data: pdfBuffer.toString('base64') } },
        { text: ANALYSIS_PROMPT },
      ],
    }],
    config: { responseMimeType: 'application/json' },
  });

  const usage = extractUsage(response);

  const text = response.text;
  if (!text) {
    throw new Error('Gemini returned empty response for page analysis');
  }

  let analysis: GeminiPageAnalysis;
  try {
    analysis = JSON.parse(text);
  } catch (jsonErr) {
    throw new Error(
      `Invalid JSON from page analysis. ` +
      `Response length: ${text.length}. ` +
      `First 500 chars: ${text.slice(0, 500)}. ` +
      `JSON error: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`
    );
  }

  if (!Array.isArray(analysis.pages)) {
    throw new Error(
      `Missing pages array. Keys: ${Object.keys(analysis).join(', ')}. Preview: ${text.slice(0, 300)}`
    );
  }

  return {
    analysis,
    meta: {
      raw_response_length: text.length,
      model,
      pdf_size_bytes: pdfBuffer.length,
      total_pages: analysis.pages.length,
      evidence_photo_count: analysis.pages.filter(p => p.is_evidence_photo).length,
      pages_with_codes: analysis.pages.filter(p => p.violation_code).length,
      usage,
    },
  };
}
