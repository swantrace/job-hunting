You are an expert full-stack developer. Build a modern Job Application Tracker web application using this specific stack:
- Runtime & Package Manager: Bun
- Meta-framework: HonoX (Hono for Vite)
- UI Template Rendering: hono/jsx (Strictly server-side components, no React/Preact client hydration frameworks)
- Frontend Interactivity: htmx (via CDN script tag, executing async partial view swaps)
- Form Data Validation: bouncer (To check incoming HTTP POST/PUT payloads safely)
- Styling Engine & UI Components: Tailwind CSS + daisyUI toolkit
- Database Engine: Built-in `bun:sqlite` (Local physical data file output target: `jobs.db`)
- Object Relational Mapper: Drizzle ORM

### 1. Database Architecture & Uniform Data Typing
Implement a normalized database schema in `src/db/schema.ts` targeting `bun:sqlite`. All date fields across the entire database must be strictly declared using the `text` data type, storing dates uniformly as ISO strings ("YYYY-MM-DD") to allow seamless sorting and filtering.
Establish the following tables:
- `companies`: id, name (unique), website, created_at (text).
- `tags`: id, name (unique).
- `job_applications_to_tags`: Junction table linking jobs to tags many-to-many.
- `job_applications`: id, company_id (foreign key), job_title, location, url, posted_date (text), priority (A/B/C), applied_date (text), resume_version, match_level (A/B), application_source, salary, contact, notes, status, apply_today_target_date (text), created_at (text), updated_at (text).
- `follow_ups`: id, job_application_id (foreign key), action_date (text), notes.
- `interviews`: id, job_application_id (foreign key), interview_date (text), round_name, notes.

### 2. Automated Pipeline Status Transitions
The application tracking status must support explicit states, updated instantly via htmx user interaction actions:
- "Saved": Default state assigned when the Phase 1 quick collect form is executed.
- "Apply Today": Clicking an "Add to Today's Tasks" button patches the application status to `Apply Today` and writes today's ISO date string into `apply_today_target_date`.
- "Applied": Submitting the comprehensive Phase 2 form updates the status state cleanly to `Applied`.
- "Follow Up": Adding a historical entry into the `follow_ups` sub-table automatically intercepts the parent pipeline state and advances its status to `Follow Up`.
- "Interviewing": Logging a record into the `interviews` sub-table automatically shifts the parent tracking state status to `Interviewing`.
- "Rejected": Clicking a designated "Mark as Rejected" badge shifts the parent state status directly to `Rejected`.
- "Archived": Hides items from active views manually.

### 3. Advanced Search Filtering and Dashboard UI Layout
Create a single-page management dashboard using a responsive daisyUI panel layout:
- **Global Filter & Search Bar**: Provide a powerful real-time filtering bar querying data by: a full-text search string (searches job title and company name strings matching database `LIKE` operators), a Priority dropdown tier select, and a dedicated toggle reading "Show Only Today's Tasks" (filters rows matching status `Apply Today` AND `apply_today_target_date` matching today's current string date).
- **Phase 1 Form Workspace**: A sleek, rapid entry form collecting minimal fields instantly (Title, Company name string which checks/auto-creates a row inside the company table, Location, URL, true Posted Date defaulting to today, and Direction tags). Submitting fires an htmx POST passing inputs through `bouncer` checking rules. On success, append the item live to the tracking view stack.
- **Phase 2 Complete Form Workspace**: Clicking a "🚀 Sent Application" button triggers htmx to pull down the dynamic detailed Phase 2 form contextual to that application ID. Saving updates the metadata, updates the status, moves the element to the applied section, and re-renders global metric count ribbons out-of-band (`hx-swap="outerHTML"`).

### 4. Technical Deliverables
1. Complete structural architecture directory maps complying cleanly with standard HonoX file-based project directory conventions.
2. Initialization configurations setting up the local SQLite physical database connection client strings.
3. Code scripts defining server routing execution paths returning pure `hono/jsx` nodes rendered out safely as semantic HTML components optimized for htmx partial swaps.
Use code with caution.I can help you build this out step-by-step. Would you like me to start by generating the complete src/db/schema.ts file alongside the database client setup, or should we build out the Bouncer validation rules for handling your forms safely?