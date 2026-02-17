import { createAdminClient } from '@/lib/supabase/server';
import type { ParseMetadata, ParseStepStatus } from '@/lib/ai/schemas';

export interface LogEntry {
  ts: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  step: string;
  message: string;
  data?: Record<string, unknown>;
  duration_ms?: number;
}

export interface StepVerification {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
}

/**
 * Structured logger for the NOI parse pipeline.
 * All logs are accumulated in-memory and flushed to parse_metadata on each step transition.
 * This means if the process crashes, we have logs up to the last completed step.
 */
export class ParseLogger {
  private violationId: string;
  private logs: LogEntry[] = [];
  private steps: ParseStepStatus[] = [];
  private extras: Record<string, unknown> = {};

  constructor(violationId: string) {
    this.violationId = violationId;
  }

  // Core logging methods
  info(step: string, message: string, data?: Record<string, unknown>) {
    this.addLog('info', step, message, data);
  }

  warn(step: string, message: string, data?: Record<string, unknown>) {
    this.addLog('warn', step, message, data);
  }

  error(step: string, message: string, data?: Record<string, unknown>) {
    this.addLog('error', step, message, data);
  }

  debug(step: string, message: string, data?: Record<string, unknown>) {
    this.addLog('debug', step, message, data);
  }

  private addLog(level: LogEntry['level'], step: string, message: string, data?: Record<string, unknown>) {
    this.logs.push({
      ts: new Date().toISOString(),
      level,
      step,
      message,
      data,
    });
  }

  // Step lifecycle: start → (verify) → complete/fail
  async stepStart(stepName: string, message: string) {
    this.info(stepName, `STARTED: ${message}`);
    this.upsertStep(stepName, 'running', message);
    await this.flush();
  }

  async stepComplete(stepName: string, message: string, verification?: StepVerification, extra?: Record<string, unknown>) {
    if (verification) {
      const failed = verification.checks.filter(c => !c.passed);
      if (failed.length > 0) {
        this.warn(stepName, `Verification warnings: ${failed.map(f => f.name).join(', ')}`, {
          checks: verification.checks,
        });
      } else {
        this.info(stepName, `Verification passed: ${verification.checks.map(c => c.name).join(', ')}`);
      }
      if (!verification.passed) {
        return this.stepFail(stepName, `Verification failed: ${failed.map(f => `${f.name}: ${f.detail}`).join('; ')}`, {
          verification,
        });
      }
    }

    this.info(stepName, `COMPLETED: ${message}`);
    this.upsertStep(stepName, 'completed', message);
    if (extra) Object.assign(this.extras, extra);
    await this.flush();
  }

  async stepFail(stepName: string, message: string, data?: Record<string, unknown>) {
    this.error(stepName, `FAILED: ${message}`, data);
    this.upsertStep(stepName, 'failed', message);
    await this.flush('failed');
  }

  // Timed execution wrapper — runs a function, logs duration and errors
  async timed<T>(step: string, label: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    this.debug(step, `Starting: ${label}`);
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.info(step, `Finished: ${label}`, { duration_ms: duration });
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? err.stack : undefined;
      this.error(step, `Error in ${label} after ${duration}ms: ${errorMessage}`, {
        duration_ms: duration,
        error_message: errorMessage,
        error_stack: errorStack?.split('\n').slice(0, 5).join('\n'),
      });
      throw err;
    }
  }

  // Set extra metadata fields (items_found, photos_matched, etc.)
  setExtra(key: string, value: unknown) {
    this.extras[key] = value;
  }

  private upsertStep(stepName: string, status: ParseStepStatus['status'], message?: string) {
    const idx = this.steps.findIndex(s => s.step === stepName);
    const stepData: ParseStepStatus = {
      step: stepName as ParseStepStatus['step'],
      status,
      message,
      ...(status === 'running' ? { started_at: new Date().toISOString() } : {}),
      ...(status === 'completed' || status === 'failed' ? { completed_at: new Date().toISOString() } : {}),
    };
    if (idx >= 0) {
      // Preserve started_at from the running state
      if (this.steps[idx].started_at && !stepData.started_at) {
        stepData.started_at = this.steps[idx].started_at;
      }
      this.steps[idx] = stepData;
    } else {
      this.steps.push(stepData);
    }
  }

  // Flush current state to the violations table.
  // Merges with existing parse_metadata so that each Inngest invocation
  // preserves data from previous steps (Inngest re-creates the function
  // context for each step, so in-memory state is lost between steps).
  async flush(parseStatus?: string) {
    const supabase = createAdminClient();

    // Read existing metadata to merge with
    const { data: existing } = await supabase
      .from('violations')
      .select('parse_metadata')
      .eq('id', this.violationId)
      .single();

    const existingMeta = (existing?.parse_metadata as Record<string, unknown>) || {};
    const existingSteps: ParseStepStatus[] = (existingMeta.steps as ParseStepStatus[]) || [];
    const existingLogs: LogEntry[] = (existingMeta.logs as LogEntry[]) || [];

    // Merge steps: upsert by step name (preserve previous steps, update current)
    const mergedSteps = [...existingSteps];
    for (const step of this.steps) {
      const idx = mergedSteps.findIndex(s => s.step === step.step);
      if (idx >= 0) {
        mergedSteps[idx] = step;
      } else {
        mergedSteps.push(step);
      }
    }

    // Append new logs, then clear so re-flush doesn't duplicate
    const mergedLogs = [...existingLogs, ...this.logs];
    this.logs = [];

    const metadata: ParseMetadata & { logs: LogEntry[] } = {
      ...existingMeta,
      steps: mergedSteps,
      logs: mergedLogs,
      ...this.extras,
    } as ParseMetadata & { logs: LogEntry[] };

    const update: Record<string, unknown> = { parse_metadata: metadata };
    if (parseStatus) {
      update.parse_status = parseStatus;
    } else {
      // Derive parse_status from ALL steps (merged across invocations)
      const hasFailed = mergedSteps.some(s => s.status === 'failed');
      const allComplete = mergedSteps.length > 0 && mergedSteps.every(s => s.status === 'completed');
      const hasRunning = mergedSteps.some(s => s.status === 'running');
      if (hasFailed) update.parse_status = 'failed';
      else if (allComplete) update.parse_status = 'completed';
      else if (hasRunning) update.parse_status = 'processing';
    }

    await supabase
      .from('violations')
      .update(update)
      .eq('id', this.violationId);
  }
}
