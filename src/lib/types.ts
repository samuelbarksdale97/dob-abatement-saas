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
  unit: string | null;
  city: string;
  state: string;
  zip: string | null;
  is_vacant: boolean;
  occupant_name: string | null;
  occupant_phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Violation {
  id: string;
  org_id: string;
  property_id: string | null;
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

export interface Submission {
  id: string;
  org_id: string;
  violation_id: string;
  submitted_by: string | null;
  submitted_at: string;
  confirmation_number: string | null;
  document_storage_path: string | null;
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

export interface Notification {
  id: string;
  org_id: string;
  user_id: string;
  title: string;
  message: string | null;
  type: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

export interface ViolationStats {
  total: number;
  by_status: Record<string, number>;
  by_priority: { P1: number; P2: number; P3: number };
  overdue: number;
  due_within_10_days: number;
  total_fines: number;
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
