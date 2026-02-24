DOB ABATEMENT AUTOMATION SYSTEM
Technical Specification Document


Table of Contents
1. Context & Background
2. Functional Requirements
3. Technical Requirements
4. Acceptance Criteria
5. Edge Cases & Error Scenarios
6. UI/UX Specifications
7. Dependencies & Assumptions
8. Out of Scope
9. Implementation Phases
10. User Stories

1. Context & Background
1.1 Purpose
Eagle Group/Yoke currently manages Department of Buildings (DOB) housing violations through a manual, time-intensive process that results in delayed abatements, accumulating fines, and operational inefficiency. With 184 open violations and an average submission time of 45 days (target: 14 days), the company faces significant financial penalties and reputational risk. This system will automate the entire DOB abatement workflow from NOI receipt through submission and closure, reducing manual effort by 80%, improving first-time approval rates from 72% to 90%, and potentially saving $50K+ annually in fines and labor costs.
1.2 Vision Document
Reference: DOB Abatement Process Flowchart (January 15, 2026)
1.3 Key Stakeholders
Chris Grant, Property Owner/CEO - Final decision maker, current NOI email recipient, oversees entire abatement process
Nikita Gray, DOB Abatement Project Manager - Primary system user, coordinates repairs, takes photos, submits to DOB portal
Sam Barksdale (NexArc), AI Developer - System architect and developer, responsible for automation implementation
Andy Parker, Strategic Advisor - AppFolio implementation lead, ensures integration with property management system
Alex, Building Contractor - Executes repairs, potential mobile app user for photo submission
1.4 Current State Analysis
Pain Points
184 open violations tracked in Excel spreadsheet with no centralized dashboard
Manual PDF parsing and data entry from NOI emails into tracking system
Time-consuming photo matching process (before/after from exact angles)
Inconsistent photo quality leading to 28% rejection rate
Lost or delayed NOI emails due to lack of automated monitoring
No systematic prioritization of Priority 1 (24-hour) vs Priority 2 (60-day) violations
Tenant coordination challenges for occupied units
Manual document preparation for DOB submission
No visibility into work progress or bottlenecks
Key Metrics (Current State)

2. Functional Requirements
2.1 Email Monitoring & NOI Intake
Description: Automated detection and parsing of Department of Buildings Notice of Infraction (NOI) emails from Chris Grant's inbox.
User Story: As Chris (Property Owner), I want the system to automatically detect NOI emails so that no violations are missed or delayed.
Business Rules:
Monitor Chris Grant's email inbox for messages from DOB (@dc.gov domain)
Identify NOI emails by subject line patterns: "Notice of Infraction", "NOI", "Housing Violation"
Extract PDF attachments automatically from identified emails
Parse PDF to extract: Property address, Unit number, Inspection date, Violation priority (P1/P2), Individual violation line items, Violation types, Required photos
Create database record immediately upon detection
Send Slack notification to Nikita within 5 minutes of email receipt
Flag Priority 1 (24-hour) violations with urgent status
2.2 Violation Dashboard & Tracking
Description: Centralized web dashboard displaying all violations with filtering, sorting, and status tracking capabilities.
User Story: As Nikita (Project Manager), I want to see all violations in one dashboard so that I can prioritize work and track progress efficiently.
Business Rules:
Display violations in card/table format with key information visible: NOI number, Property/Unit, Priority level, Days remaining, Current status, Assigned to
Filter by: Priority (P1/P2), Status, Property, Date range, Vacant vs Occupied
Sort by: Priority (P1 first), Days until deadline, Date received, Status
Color-code based on urgency: Red for Priority 1, Orange for <10 days remaining, Yellow for <30 days, Green for on track
Show statistics: Total open violations, Vacant vs occupied breakdown, Priority distribution, Average days to completion
Click violation to view full details including: All violation line items, Photos required, Work order status, Communication history, Submission history
2.3 Work Order Management
Description: System for assigning repair work to contractors and tracking completion status.
User Story: As Nikita, I want to create and assign work orders from violations so that Alex knows exactly what needs to be fixed.
Business Rules:
Auto-create work order from NOI violation data
Check unit occupancy status from AppFolio integration
For vacant units: Assign directly to Alex with immediate scheduling
For occupied units: Flag for tenant coordination, require tenant contact before assignment
Work order includes: Violation description, Required repairs, Unit location, Priority level, Photos needed (angles and specifications), Due date
Send work order notification via: Email to contractor, SMS (optional), Mobile app push notification (Phase 2)
Allow status updates: Assigned, Scheduled, In Progress, Awaiting Parts, Completed
Contractor can upload completion photos directly through mobile interface
2.4 Photo Management & Quality Control
Description: AI-powered photo guidance and validation system to ensure submission-ready documentation.
User Story: As Alex (Contractor), I want the app to tell me if my photos are good enough so that I don't have to retake them later.
Business Rules:
Display original DOB violation photo as reference
Provide real-time photo guidance: "Match this angle", "Move closer", "Better lighting needed", "Photo approved ✓"
Use AI vision model (GPT-4 Vision / Gemini Vision) to compare angles
Require before AND after photos for each violation item
Photo metadata capture: Timestamp, GPS location, Camera settings
Store photos in Supabase Storage with violation reference
Automatically pair before/after photos for submission document
Quality threshold: 80% angle match required for approval
Allow manual override by Nikita if AI rejects valid photo
2.5 DOB Submission Automation
Description: Automated generation of submission documents and portal submission to DOB.
User Story: As Nikita, I want the system to auto-generate submission documents and submit them to DOB so that I save 3+ hours per violation.
Business Rules:
Generate Word document matching DOB template format
Include all required elements: NOI number, Property address, Violation items with before/after photo pairs, Date of remediation, Contractor information
Auto-fill DOB web portal using Playwright browser automation
Navigate portal: Login with credentials, Find correct NOI case, Upload generated document, Upload individual photos, Submit form
Handle common errors: Session timeout (retry), File size limit (compress images), Network errors (queue for retry)
Capture confirmation email/number from DOB
Update violation status to "Submitted - Awaiting Response"
Archive submission in Google Drive with naming: [NOI_NUMBER]_[PROPERTY]_[DATE].docx
2.6 Response Monitoring & Closure
Description: Track DOB responses and handle approval, rejection, or additional information requests.
User Story: As Nikita, I want to be notified when DOB responds so that I can quickly handle any issues or close completed cases.
Business Rules:
Monitor email for DOB responses (confirmation, approval, rejection, additional info needed)
Parse response type and update violation status accordingly
If APPROVED: Change status to "Closed", Archive all documents, Update metrics, Send celebration notification to team
If REJECTED: Reopen work order, Notify Nikita and Alex with rejection reason, Move to "Rework Required" status, Track as rework in analytics
If MORE PHOTOS NEEDED: Notify contractor with specific requirements, Move to "Additional Photos" status, Restart photo submission workflow
Track reinspection notices separately
Calculate and display fine reduction based on successful abatements

3. Technical Requirements
3.1 Technology Stack
3.2 Data Models
violations Table
Status Enum Values:
NEW - Just received, not yet reviewed
PENDING_ASSIGNMENT - Reviewed, awaiting work order creation
ASSIGNED - Work order created and sent to contractor
IN_PROGRESS - Contractor working on repairs
AWAITING_PHOTOS - Repairs complete, waiting for documentation
PHOTOS_UPLOADED - Photos received, awaiting review
READY_FOR_SUBMISSION - Photos approved, ready to submit to DOB
SUBMITTED - Submitted to DOB, awaiting response
ADDITIONAL_INFO_REQUESTED - DOB requested more information
REJECTED - DOB rejected submission, rework needed
APPROVED - DOB approved abatement
CLOSED - Case fully closed
violation_items Table
photos Table
work_orders Table
3.3 API Specifications
POST /api/violations
Purpose: Create new violation from NOI email parsing
Authentication: API Key (n8n workflow)
Response: 201 Created { id, noi_number, created_at }

GET /api/violations
Purpose: Retrieve violations with filtering and sorting
Authentication: Session-based (Admin users only)
Response: 200 OK { violations: [...], total_count, page }

GET /api/violations/:id
Purpose: Retrieve single violation with all details
Authentication: Session-based
Response: 200 OK { violation, items: [...], photos: [...] }

PATCH /api/violations/:id
Purpose: Update violation status or details
Authentication: Session-based (Admin or PM role)
Response: 200 OK { violation }

POST /api/photos/upload
Purpose: Upload and validate photo for violation item
Authentication: Session-based or Mobile App Token
Response: 200 OK { photo_id, quality_score, approved, feedback_message }

POST /api/submissions/generate
Purpose: Generate DOB submission document
Authentication: Session-based (Admin or PM role)
Response: 200 OK { document_url, ready_for_submission }

POST /api/submissions/submit
Purpose: Auto-submit to DOB portal via Playwright
Authentication: Session-based (Admin or PM role)
Response: 200 OK { submission_id, confirmation_number, submitted_at }

3.4 Performance Requirements
Dashboard page load time: Under 2 seconds for initial render
Violation list API response: Under 500ms for up to 500 records
Photo upload processing: Under 5 seconds including AI validation
Document generation: Under 10 seconds per violation
DOB portal submission: Under 60 seconds (excluding portal response time)
Concurrent users: Support 10 simultaneous users without degradation
Email monitoring: Check inbox every 5 minutes during business hours
Database query optimization: All queries under 100ms with proper indexing

4. Acceptance Criteria
Every item below must be testable and measurable.
4.1 Email Monitoring & Intake
System detects 100% of NOI emails within 5 minutes of receipt
PDF attachment is automatically downloaded and stored in Supabase Storage
All required fields are extracted with 95% accuracy
Violation items are parsed into individual database records
Slack notification is sent to Nikita within 5 minutes
Priority 1 violations are flagged with URGENT status and highlighted in red
System creates violation record even if partial data is missing (with flags for manual review)
4.2 Dashboard & Tracking
Dashboard displays all open violations in card/table view
User can filter by status, priority, property, vacant/occupied with results updating in under 1 second
User can sort by priority, due date, status, and property
Color coding is applied correctly: Red (P1), Orange (<10 days), Yellow (<30 days), Green (on track)
Statistics panel shows accurate counts
Clicking a violation opens detail view with all items, photos, work orders, and history
Dashboard updates in real-time when violation status changes
4.3 Work Order Management
Work order is auto-created with all violation details
System checks AppFolio and correctly identifies unit as vacant or occupied
For vacant units, contractor receives email notification within 2 minutes
For occupied units, system flags for tenant coordination
Contractor can update work order status
Status updates are reflected on dashboard immediately
Work order includes all required information
4.4 Photo Management
Mobile interface displays original DOB violation photo as reference
AI provides real-time feedback on photo angle with 80% accuracy threshold
Photo is approved automatically if quality score >= 0.80
Photo is rejected with specific feedback if quality score < 0.80
User can override AI rejection if photo is actually acceptable
Both before and after photos are required for each violation item
Photos are automatically paired and ready for document generation
4.5 DOB Submission
Document is generated in under 10 seconds with all required elements
Document format matches DOB requirements exactly
Portal submission completes successfully in under 60 seconds
Confirmation number is captured and stored
Violation status is updated to "Submitted"
Document is archived in Google Drive with correct naming
System handles portal errors gracefully with retry logic
4.6 Response Monitoring
System detects DOB response emails within 5 minutes
Response type is correctly identified (Approved/Rejected/More Info)
Appropriate notifications are sent based on response type
Violation status is updated correctly
For rejections, work order is reopened automatically
For approvals, case is closed and metrics are updated
Fine reduction is calculated and displayed on dashboard

5. Edge Cases & Error Scenarios
Scenario 1: Email arrives with malformed PDF
Condition: PDF is corrupted or password-protected
Expected Behavior: System flags for manual review, sends notification to Nikita, stores email for later processing

Scenario 2: Duplicate NOI received
Condition: Same NOI number already exists in database
Expected Behavior: System logs duplicate, checks for updates, merges any new violation items, notifies Nikita of duplicate

Scenario 3: Photo upload fails
Condition: Network error during photo upload
Expected Behavior: Store photo locally on device, retry upload when connection restored, show "Upload Pending" status

Scenario 4: AI quality check fails
Condition: AI service is unavailable
Expected Behavior: Flag photo for manual review, allow upload to proceed, notify admin of AI service issue

Scenario 5: DOB portal is down
Condition: Portal returns 503 or timeout error
Expected Behavior: Queue submission for retry, attempt every 30 minutes, notify Nikita after 3 failed attempts

Scenario 6: Contractor uploads wrong photo
Condition: Photo is for different violation item
Expected Behavior: AI detects mismatch, rejects photo, provides specific feedback, allows re-upload

Scenario 7: Multiple violations for same unit
Condition: Unit has 3+ open NOIs
Expected Behavior: Display all violations grouped by unit, allow batch work order creation, prioritize by due date

Scenario 8: Tenant refuses access
Condition: Occupied unit, tenant will not allow entry
Expected Behavior: Flag violation with special status, escalate to Chris, track coordination attempts

Scenario 9: Priority 1 violation received after hours
Condition: NOI arrives at 8pm, due in 24 hours
Expected Behavior: Send urgent SMS to Nikita and Chris, escalate in dashboard, trigger emergency protocol

Scenario 10: AppFolio API is unavailable
Condition: Cannot check unit occupancy status
Expected Behavior: Use cached data if available, flag for manual verification, log API outage


6. UI/UX Specifications
6.1 Dashboard Layout
Wireframes: Reference Loom demo video (https://www.loom.com/share/d62558df84b441bfb2884a8ded3b187c)
Key Components
Top Navigation Bar: Logo, Search violations, User profile, Notifications bell
Statistics Panel: Total open, Priority breakdown, Vacant vs occupied, Days to deadline average
Filter Sidebar: Status checkboxes, Priority radio buttons, Property dropdown, Date range picker, Vacant/Occupied toggle
Violation Cards Grid: Card shows: NOI number, Property address, Priority badge, Days remaining counter, Status indicator, Quick actions (View, Edit, Assign)
Detail Modal: Full violation information, Tabbed interface (Overview, Items, Photos, Work Orders, History), Action buttons (Assign Work, Upload Photos, Generate Doc, Submit to DOB)
Mobile-Responsive: Collapses to single column, Bottom navigation, Swipe gestures for cards
6.2 Color Scheme
6.3 Interaction Patterns
When user clicks "Assign Work" button → Opens modal with work order form, Auto-populates contractor, Shows estimated completion date
When user uploads photo → Shows progress indicator, AI analyzes in real-time, Displays approval/rejection instantly
When violation status changes → Card updates color and position, Animation slides card to new position, Toast notification confirms change
When user hovers over violation card → Card elevates with shadow, Quick action buttons appear, Preview tooltip shows details
When filtering violations → Results update without page reload, Loading skeleton appears briefly, Result count updates in header
When generating document → Progress bar shows stages (Gathering data → Creating doc → Uploading), Success notification with download link, Document preview opens in new tab
6.4 Mobile App Interface (Phase 2)
Home Screen: List of assigned work orders, Priority indicators, Tap to view details
Work Order Detail: Violation description, Location/unit info, Required repairs checklist, Photo requirements with examples
Camera Interface: Reference photo overlay, Real-time angle guidance, Capture button with immediate feedback, Retake option
Photo Review: Before/after comparison slider, AI quality score displayed, Approval status shown, Upload to server button
Offline Support: Cache work orders locally, Queue photos for upload, Sync when connection restored
Notifications: Push notifications for new assignments, Reminders for due dates, Approval confirmations

7. Dependencies & Assumptions
7.1 Dependencies
Supabase account and project setup with appropriate storage limits
n8n instance deployed and configured for workflow automation
Access to Chris Grant's email inbox (OAuth or App Password)
AppFolio API credentials and proper permissions for property data access
DOB portal credentials (username/password) for automated submission
Google Drive API credentials for document archiving
Slack workspace and webhook URL for notifications
OpenAI API key for GPT-4 and GPT-4 Vision access
Gemini API key (optional backup for photo validation)
SendGrid account for transactional emails
Domain name and SSL certificate for web dashboard
AWS or similar cloud hosting for n8n and API backend
Mobile app distribution (Phase 2): Apple Developer account, Google Play Console
7.2 Assumptions
Users have modern web browsers (Chrome, Firefox, Safari, Edge latest versions)
Mobile users have smartphones with camera (iOS 14+ or Android 10+) for Phase 2
DOB email format and PDF structure remain consistent (system can adapt to minor changes)
DOB portal structure does not undergo major changes during development
AppFolio integration will be ready within project timeline
Alex and other contractors are willing to use mobile app or email notifications
Internet connectivity is available at work sites for photo uploads
DOB portal allows automated submissions (no CAPTCHA or bot detection)
Chris and Nikita have adequate training time to learn new system
Existing 184 violations can be bulk imported or will be processed as NOIs are re-received
7.3 Integration Dependencies
AppFolio API must provide: Property list, Unit details, Occupancy status, Tenant contact information (if available)
DOB Portal must allow: Programmatic login, Case lookup by NOI number, Document upload, Photo upload, Form submission
Email Provider (Gmail/Outlook) must support: IMAP/POP3 access or API, OAuth authentication, Attachment download
Slack API must support: Incoming webhooks, Channel posting, User mentions, Rich message formatting

8. Out of Scope
The following features and functionalities are explicitly NOT included in this project:
Tenant portal or tenant-facing features
Financial management or fine payment processing
Integration with accounting software (QuickBooks, Xero, etc.)
Vendor/contractor marketplace or bidding system
Preventive maintenance scheduling
Property inspection app beyond DOB violations
Lease management or rental applications
Multi-language support (English only)
White-label or multi-tenant capabilities
Public-facing website or SEO optimization
Marketing automation or email campaigns
Advanced analytics or machine learning beyond photo validation
Integration with other city agencies (DCRA, etc.) beyond DOB
Automated fine dispute or appeal submissions
Historical data migration from Excel (manual CSV import only)

9. Implementation Phases
Phase 1: Foundation & Intake (Weeks 1-4)
Goal: Automate NOI detection and create centralized dashboard
Deliverables:
Email monitoring system operational
PDF parsing and data extraction working with 95% accuracy
Database schema implemented with all tables
Basic dashboard displaying violations
Slack notifications for new NOIs
Manual CSV import tool for existing 184 violations
Success Metrics:
All new NOIs detected within 5 minutes, Zero missed violations
Phase 2: Work Order & Photo Management (Weeks 5-8)
Goal: Enable work assignment and implement AI photo validation
Deliverables:
Work order creation and assignment system
AppFolio integration for occupancy checking
AI photo validation with GPT-4 Vision
Photo upload interface (web-based for MVP)
Before/after photo pairing logic
Manual photo approval override capability
Success Metrics:
Work orders created in under 2 minutes, 80% photo approval rate on first upload
Phase 3: Submission Automation (Weeks 9-12)
Goal: Automate document generation and DOB portal submission
Deliverables:
Word document generation with proper formatting
Playwright automation for DOB portal
Google Drive archiving
Response monitoring and status updates
Error handling and retry logic
End-to-end submission workflow testing
Success Metrics:
90% successful automated submissions, Average submission time under 15 minutes
Phase 4: Mobile App & Scale (Weeks 13-16)
Goal: Launch contractor mobile app and scale to other DC housing providers
Deliverables:
React Native mobile app for iOS and Android
Real-time photo guidance with camera integration
Offline work order caching
Push notifications for contractors
Analytics dashboard for metrics tracking
White paper and case study for industry adoption
Success Metrics:
Mobile app adoption by all contractors, System ready for external clients

10. User Stories
10.1 Chris (Property Owner) User Stories
As Chris, I want to receive immediate notification of Priority 1 violations so that I can ensure 24-hour compliance
As Chris, I want to see a high-level dashboard of all open violations so that I understand our compliance posture
As Chris, I want to view historical trends and fine reductions so that I can demonstrate ROI to stakeholders
As Chris, I want email notifications for successful submissions so that I have peace of mind violations are being handled
As Chris, I want to delegate violation management to Nikita while retaining visibility so that I can focus on strategic decisions
10.2 Nikita (Project Manager) User Stories
As Nikita, I want to see all violations in one dashboard with filters so that I can prioritize my daily work
As Nikita, I want to create work orders with one click so that I can quickly assign repairs to Alex
As Nikita, I want to know which units are vacant so that I can fast-track those violations
As Nikita, I want to be notified when photos are uploaded so that I can review and approve them quickly
As Nikita, I want the system to generate submission documents automatically so that I save 3+ hours per violation
As Nikita, I want to see the status of each violation at a glance so that I can answer Chris's questions confidently
As Nikita, I want to be alerted when DOB responds so that I can handle rejections or close approvals immediately
As Nikita, I want to override AI photo rejections so that I have final say on photo quality
10.3 Alex (Contractor) User Stories
As Alex, I want to receive work orders via email so that I know exactly what needs to be fixed
As Alex, I want to see reference photos from the DOB inspection so that I know what to repair
As Alex, I want the app to tell me if my photo is good enough so that I don't waste time retaking photos
As Alex, I want to upload photos immediately after completing work so that I can close the work order
As Alex, I want to update work order status so that Nikita knows I'm making progress
As Alex, I want to work offline at job sites so that poor connectivity doesn't block my work
10.4 System Administrator User Stories
As a system admin, I want to monitor API health and uptime so that I can proactively address issues
As a system admin, I want to see logs of all automated actions so that I can debug failures
As a system admin, I want to manually trigger workflows so that I can test or recover from errors
As a system admin, I want to configure email monitoring settings so that I can adapt to email provider changes
As a system admin, I want to update DOB portal credentials securely so that automated submissions continue working
--- TABLE ---
Project ID | DOB-AUTO-2026-001
Client | Eagle Group / Yoke
Analyst | Sam Barksdale - NexArc
Date | February 4, 2026
Status | Draft
--- TABLE ---
Metric | Current Value
Open Violations | 184
Average Time to Submission | 45 days (Target: 14 days)
First-Time Approval Rate | 72% (Target: 90%)
Vacant Units | 23
Occupied Units | 161
Fines Reduced (YTD) | $12,450
--- TABLE ---
Layer | Technology
Database | Supabase (PostgreSQL)
File Storage | Supabase Storage (Images), Google Drive (Document Archives)
Automation | n8n (Workflow orchestration), Playwright (Browser automation)
AI/ML | GPT-4 / GPT-4 Vision (Email parsing, Photo comparison), Gemini Vision (Photo validation backup)
Frontend | React.js (Admin Dashboard), React Native (Mobile App - Phase 2)
Backend | Node.js / Express (API), Supabase Edge Functions (Serverless)
Notifications | Slack API, Email (SendGrid), SMS (Twilio - Phase 2)
Integration | AppFolio API (Property data, Occupancy status)
--- TABLE ---
Field | Type | Constraints | Description
id | UUID | PRIMARY KEY | Unique identifier
noi_number | VARCHAR(50) | UNIQUE, NOT NULL | DOB NOI number
property_address | TEXT | NOT NULL | Property address
unit_number | VARCHAR(20) |  | Unit number
inspection_date | DATE | NOT NULL | DOB inspection date
priority | ENUM | 'P1', 'P2' | Priority level
status | ENUM | See status list | Current status
is_vacant | BOOLEAN | DEFAULT false | Unit occupancy
due_date | DATE |  | Calculated deadline
submitted_date | TIMESTAMP |  | Submission date
closed_date | TIMESTAMP |  | Closure date
pdf_url | TEXT |  | Original NOI PDF
created_at | TIMESTAMP | DEFAULT NOW() | Record creation
--- TABLE ---
Field | Type | Constraints | Description
id | UUID | PRIMARY KEY | Unique identifier
violation_id | UUID | FK, NOT NULL | Parent violation
item_number | VARCHAR(10) |  | Item number in NOI
description | TEXT |  | Violation description
violation_type | VARCHAR(100) |  | Pest, Plumbing, etc
location | TEXT |  | Specific location
status | ENUM |  | Item-specific status
created_at | TIMESTAMP | DEFAULT NOW() | Record creation
--- TABLE ---
Field | Type | Constraints | Description
id | UUID | PRIMARY KEY | Unique identifier
item_id | UUID | FK, NOT NULL | Violation item
photo_type | ENUM | 'BEFORE', 'AFTER' | Photo classification
storage_url | TEXT | NOT NULL | Supabase Storage URL
ai_quality_score | DECIMAL(3,2) | 0.00-1.00 | AI validation score
approved | BOOLEAN | DEFAULT false | Approval status
uploaded_by | VARCHAR(100) |  | User who uploaded
uploaded_at | TIMESTAMP | DEFAULT NOW() | Upload timestamp
--- TABLE ---
Field | Type | Constraints | Description
id | UUID | PRIMARY KEY | Unique identifier
violation_id | UUID | FK, NOT NULL | Parent violation
assigned_to | VARCHAR(100) |  | Contractor name
status | ENUM | See statuses | Work order status
scheduled_date | DATE |  | Scheduled completion
completed_date | TIMESTAMP |  | Actual completion
notes | TEXT |  | Additional notes
created_at | TIMESTAMP | DEFAULT NOW() | Record creation
--- TABLE ---
Element | Color | Usage
Primary | #667eea (Blue-Purple) | Buttons, Headers, Links
Secondary | #764ba2 (Purple) | Accents, Highlights
Success | #28a745 (Green) | Approved, Completed, On Track
Warning | #ffc107 (Yellow) | <30 days remaining
Danger | #dc3545 (Red) | Priority 1, Overdue, <10 days
Info | #17a2b8 (Cyan) | Notifications, Info messages
Background | #f8f9fa (Light Gray) | Page background
Card | #ffffff (White) | Card backgrounds, Modals