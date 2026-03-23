import { z } from 'zod';

// Schema for the structured data extracted from an NOI PDF by Gemini
export const NOIParseResultSchema = z.object({
  notice_level_data: z.object({
    notice_id: z.string().describe('The NOI notice ID, e.g. "25NOIR-INS-07709"'),
    respondent: z.string().describe('The respondent/property owner name, e.g. "YOKE LEBAUM LLC"'),
    infraction_address: z.string().describe('The full address including unit, e.g. "557 LEBAUM ST SE, Unit:103"'),
    date_of_service: z.string().describe('Date of service in MM/DD/YYYY format'),
    total_fines: z.string().describe('Total fine amount as string with dollar sign, e.g. "$4,499.00"'),
  }),
  work_orders: z.array(z.object({
    item_number: z.number().describe('The sequential item number from the NOI'),
    violation_code: z.string().describe('The DC housing code reference, e.g. "12-G DCMR § 309.1"'),
    priority: z.number().describe('Priority level: 1=critical/life-safety, 2=high, 3=normal'),
    abatement_deadline: z.string().describe('Deadline text, e.g. "60 Days" or "30 Days"'),
    fine: z.string().describe('Fine amount for this item as string with dollar sign, e.g. "$625.00"'),
    violation_description: z.string().describe('Full description of the violation'),
    specific_location: z.string().describe('Where in the unit the violation was found, e.g. "Sleeping Room", "Kitchen"'),
    floor_number: z.string().describe('Floor or area designation, e.g. "Interior", "1st Floor", "Exterior"'),
    date_of_infraction: z.string().describe('Date the infraction was observed in MM/DD/YYYY format'),
    time_of_infraction: z.string().describe('Time the infraction was observed, e.g. "10:24 PM"'),
    task_description: z.string().describe('The remediation task from the Notes section describing what must be done to fix this violation'),
  })),
});

export type NOIParseResult = z.infer<typeof NOIParseResultSchema>;

// Schema for Gemini Vision response (violation code per PDF page)
export const GeminiPageAnalysisSchema = z.object({
  pages: z.array(z.object({
    page_number: z.number().describe('1-indexed page number from the PDF'),
    violation_code: z.string().nullable().describe('The violation code shown on this page, or null if not a violation detail page'),
    description: z.string().describe('Brief description of what this page contains'),
    is_evidence_photo: z.boolean().describe('Whether this page contains a photo/image as evidence'),
  })),
});

export type GeminiPageAnalysis = z.infer<typeof GeminiPageAnalysisSchema>;

// Parse step status tracking
export type ParseStepName =
  | 'ai_parse'
  | 'insert_records'
  | 'analyze_pages'
  | 'match_photos'
  | 'complete';

export interface ParseStepStatus {
  step: ParseStepName;
  status: 'pending' | 'running' | 'completed' | 'failed';
  message?: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
}

export interface GeminiUsage {
  prompt_tokens: number;
  output_tokens: number;
  thoughts_tokens: number;
  total_tokens: number;
  cost_usd: number;
}

export interface ParseCosts {
  ai_parse?: GeminiUsage;
  analyze_pages?: GeminiUsage;
  total_usd?: number;
}

export interface ParseMetadata {
  steps: ParseStepStatus[];
  total_pages?: number;
  items_found?: number;
  photos_matched?: number;
  photos_unmatched?: number;
  gemini_meta?: Record<string, unknown>;
  gemini_page_meta?: Record<string, unknown>;
  costs?: ParseCosts;
  logs?: Array<{
    ts: string;
    level: string;
    step: string;
    message: string;
    data?: Record<string, unknown>;
  }>;
}
