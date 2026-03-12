export type UserRole = 'OWNER' | 'PROJECT_MANAGER' | 'CONTRACTOR' | 'ADMIN';

export type ViolationStatus =
  | 'NEW' | 'PARSING' | 'PARSED' | 'ASSIGNED' | 'IN_PROGRESS'
  | 'AWAITING_PHOTOS' | 'PHOTOS_UPLOADED' | 'READY_FOR_SUBMISSION'
  | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'ADDITIONAL_INFO_REQUESTED' | 'CLOSED';

export type WorkOrderStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type PhotoType = 'BEFORE' | 'AFTER' | 'INSPECTOR' | 'REFERENCE';
export type PhotoStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
export type SubmissionResponse = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ADDITIONAL_INFO_REQUESTED';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  org_id: string;
  full_name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Property {
  id: string;
  org_id: string;
  address: string;
  city: string;
  state: string;
  zip: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined relations
  units?: Unit[];
}

export interface Unit {
  id: string;
  org_id: string;
  property_id: string;
  unit_number: string;
  is_vacant: boolean;
  occupant_name: string | null;
  occupant_phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined relations
  violations?: Violation[];
}

export interface Violation {
  id: string;
  org_id: string;
  property_id: string | null;
  unit_id: string | null;
  notice_id: string | null;
  respondent: string | null;
  infraction_address: string | null;
  date_of_service: string | null;
  total_fines: number | null;
  status: ViolationStatus;
  priority: number;
  abatement_deadline: string | null;
  assigned_to: string | null;
  pdf_storage_path: string | null;
  parse_status: string;
  parse_metadata: Record<string, unknown>;
  raw_ai_output: Record<string, unknown> | null;
  source: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined relations
  violation_items?: ViolationItem[];
  photos?: Photo[];
  property?: Property;
  assigned_profile?: Profile;
}

export interface ViolationItem {
  id: string;
  org_id: string;
  violation_id: string;
  item_number: number | null;
  violation_code: string | null;
  priority: number;
  abatement_deadline: string | null;
  fine: number | null;
  violation_description: string | null;
  specific_location: string | null;
  floor_number: string | null;
  date_of_infraction: string | null;
  time_of_infraction: string | null;
  task_description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  // Joined relations
  photos?: Photo[];
}

export interface Photo {
  id: string;
  org_id: string;
  violation_id: string;
  violation_item_id: string | null;
  photo_type: PhotoType;
  storage_path: string;
  file_name: string | null;
  file_size: number | null;
  mime_type: string;
  page_number: number | null;
  matched_violation_code: string | null;
  status: PhotoStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  taken_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WorkOrder {
  id: string;
  org_id: string;
  violation_id: string;
  assigned_to: string | null;
  contractor_name: string | null;
  contractor_email: string | null;
  contractor_phone: string | null;
  status: WorkOrderStatus;
  due_date: string | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  violation?: Violation;
  assigned_profile?: Profile;
}

export interface ContractorToken {
  id: string;
  org_id: string;
  work_order_id: string;
  token: string;
  contractor_name: string;
  contractor_email: string;
  contractor_phone: string | null;
  expires_at: string;
  revoked_at: string | null;
  last_accessed_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Contractor {
  id: string;
  org_id: string;
  name: string;
  email: string;
  phone: string | null;
  total_assignments: number;
  last_assigned_at: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Submission {
  id: string;
  org_id: string;
  violation_id: string;
  submitted_by: string | null;
  submitted_at: string;
  confirmation_number: string | null;
  document_storage_path: string | null;
  generated_pdf_path: string | null;
  response_status: SubmissionResponse;
  response_notes: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  org_id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  changed_by: string | null;
  created_at: string;
}

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Notification {
  id: string;
  org_id: string;
  user_id: string;
  title: string;
  message: string | null;
  type: string;
  link: string | null;
  read: boolean;
  priority: NotificationPriority;
  created_at: string;
}

export interface NotificationPreferences {
  email_deadline_alerts: boolean;
  email_status_changes: boolean;
  email_daily_digest: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  email_deadline_alerts: true,
  email_status_changes: true,
  email_daily_digest: false,
};

// ============================================================================
// Contacts
// ============================================================================

export type ContactCategory = 'CONTRACTOR' | 'GOVERNMENT' | 'TENANT' | 'INTERNAL' | 'VENDOR' | 'OTHER';
export type InteractionType = 'NOTE' | 'PHONE_CALL' | 'EMAIL' | 'MEETING' | 'SYSTEM_EVENT';

export interface Contact {
  id: string;
  org_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  category: ContactCategory;
  tags: string[];
  profile_id: string | null;
  legacy_contractor_id: string | null;
  active: boolean;
  avatar_url: string | null;
  notes: string | null;
  last_interaction_at: string | null;
  total_interactions: number;
  created_at: string;
  updated_at: string;
}

export interface ContactInteraction {
  id: string;
  org_id: string;
  contact_id: string;
  interaction_type: InteractionType;
  subject: string | null;
  body: string | null;
  direction: 'inbound' | 'outbound' | null;
  source_table: string | null;
  source_record_id: string | null;
  property_id: string | null;
  violation_id: string | null;
  work_order_id: string | null;
  created_by: string | null;
  occurred_at: string;
  created_at: string;
  // Joined fields
  created_by_name?: string;
}

export interface ContactEntityLink {
  id: string;
  org_id: string;
  contact_id: string;
  entity_type: 'property' | 'violation' | 'work_order';
  entity_id: string;
  role: string | null;
  created_at: string;
  // Joined fields
  entity_label?: string;
}

export interface Invitation {
  id: string;
  org_id: string;
  email: string;
  role: string;
  token: string;
  invited_by: string | null;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

export const CONTACT_CATEGORY_COLORS: Record<ContactCategory, string> = {
  CONTRACTOR: 'bg-orange-100 text-orange-800',
  GOVERNMENT: 'bg-blue-100 text-blue-800',
  TENANT: 'bg-green-100 text-green-800',
  INTERNAL: 'bg-purple-100 text-purple-800',
  VENDOR: 'bg-gray-100 text-gray-700',
  OTHER: 'bg-gray-100 text-gray-700',
};

export const CONTACT_CATEGORY_LABELS: Record<ContactCategory, string> = {
  CONTRACTOR: 'Contractor',
  GOVERNMENT: 'Government',
  TENANT: 'Tenant',
  INTERNAL: 'Internal',
  VENDOR: 'Vendor',
  OTHER: 'Other',
};

// ============================================================================
// Stats
// ============================================================================

export interface ViolationStats {
  total: number;
  by_status: Record<string, number>;
  by_priority: { P1: number; P2: number; P3: number };
  overdue: number;
  due_within_10_days: number;
  total_fines: number;
}

// Portfolio stats (from get_portfolio_stats RPC)
export interface PropertyPortfolioStats {
  property_id: string;
  address: string;
  city: string;
  state: string;
  zip: string | null;
  violation_count: number;
  total_fines: number;
  overdue_count: number;
  p1_count: number;
  next_deadline: string | null;
  status_counts: Record<string, number>;
  unit_count: number;
}

// Dashboard filter types
export interface ViolationFilters {
  status?: ViolationStatus;
  priority?: number;
  search?: string;
  property_id?: string;
  needs_attention?: boolean;
}

export type SortField = 'priority' | 'abatement_deadline' | 'created_at' | 'total_fines' | 'notice_id';
export type SortDirection = 'asc' | 'desc';
