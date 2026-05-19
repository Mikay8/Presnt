# Presnt — Implementation Guide
> Copilot agent instructions for full project build across all phases.
> Work through phases in order. Complete all tasks in a phase before starting the next.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Mobile | React Native + Expo (SDK 51+) |
| Backend | FastAPI (Python 3.11+) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Real-Time | Supabase Realtime |
| File Storage | Supabase Storage |
| Task Queue | Celery + Redis |
| Email | Resend |
| Location | expo-location + expo-task-manager |
| QR | expo-camera + expo-barcode-scanner |
| Push Notifications | expo-notifications (APNs + FCM) |
| PDF Generation | WeasyPrint (Python) |
| Payments | Stripe |
| Error Monitoring | Sentry |

---

## Project Structure

```
prsnt/
├── mobile/
│   ├── app/
│   │   ├── (auth)/           # Login, register, onboarding
│   │   ├── (member)/         # Member-facing screens
│   │   ├── (officer)/        # Officer-facing screens
│   │   └── (admin)/          # Chapter admin screens
│   ├── components/
│   ├── hooks/
│   ├── lib/                  # Supabase client, API client, utils
│   ├── stores/               # Zustand state stores
│   └── types/                # TypeScript types matching DB schema
│
├── api/
│   ├── routers/              # Route handlers per domain
│   ├── models/               # Pydantic models
│   ├── services/             # Business logic layer
│   ├── workers/              # Celery tasks
│   ├── db/
│   └── main.py
│
└── supabase/
    ├── migrations/
    └── seed.sql
```

---

## Database Rules (enforce always)

- All timestamps `timestamptz` (UTC). Convert to org timezone at API response layer only.
- Never hard delete. Use `is_deleted boolean DEFAULT false` + `deleted_at timestamptz`.
- Never delete attendance records. Override + audit log only.
- Compliance snapshots are cached — recalculate via Postgres trigger. Never compute live in a route handler.
- QR codes rotate every 15–30 minutes. Store old codes as inactive, not deleted.
- Registration and attendance are fully decoupled. Walk-in creates attendance with no registration. Never block attendance for missing registration unless `walkin_enabled = false`.
- Most restrictive member restriction always wins.
- Audit logs and transaction ledgers are append-only. No UPDATE, no DELETE.

---

## RLS Policy Strategy (set up before writing any route)

```
Members       → SELECT own rows only
Officers      → SELECT all rows in their org, scoped by permission_set
Chapter Admin → Full access within their org
HQ Observer   → SELECT across all child orgs, no write access
```

Use `org_id` as the primary RLS anchor on every table.
Scoped visibility (committee chairs see only their committee's data) is enforced at the row level via RLS, not application logic.

---

# PHASE 1 — Foundation, Auth & Org Branding
> Goal: Supabase running, auth working, chapter onboarding under 10 minutes, org branding fully configurable.

## 1.1 Supabase Setup

- [ ] Create Supabase project
- [ ] Enable email + Google OAuth in Auth settings
- [ ] Set JWT expiry to 7 days
- [ ] Enable RLS on all tables from creation

## 1.2 Database Migrations

### Migration 001 — Organizations & Branding
```sql
CREATE TABLE organizations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  slug                text UNIQUE NOT NULL,
  type                text NOT NULL CHECK (type IN ('chapter','council','national_hq')),
  parent_org_id       uuid REFERENCES organizations(id),
  greek_letter_org    text,
  institution         text,
  founding_year       int,
  timezone            text NOT NULL DEFAULT 'America/New_York',
  is_active           boolean DEFAULT true,
  stripe_customer_id  text,
  subscription_tier   text DEFAULT 'free',
  subscription_status text DEFAULT 'active',

  -- BRANDING
  logo_url            text,             -- Supabase Storage URL for chapter logo
  banner_url          text,             -- optional banner/header image
  primary_color       text DEFAULT '#6366f1',   -- hex, main brand color
  secondary_color     text DEFAULT '#a5b4fc',   -- hex, accent color
  background_color    text DEFAULT '#0f0f1a',   -- hex, app background override
  text_color          text DEFAULT '#ffffff',   -- hex, primary text on brand backgrounds
  accent_color        text DEFAULT '#f472b6',   -- hex, buttons, highlights
  color_scheme        text DEFAULT 'dark'
                        CHECK (color_scheme IN ('dark','light','system')),
  custom_font         text,             -- optional font name (Google Fonts)
  app_display_name    text,             -- override app name shown to members e.g. "Sigma Chi"

  is_deleted          boolean DEFAULT false,
  deleted_at          timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- Org branding change log (so admins can revert)
CREATE TABLE org_branding_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid REFERENCES organizations(id) NOT NULL,
  changed_by      uuid,                -- profiles ref added after profiles table exists
  previous_values jsonb NOT NULL,      -- snapshot of branding fields before change
  new_values      jsonb NOT NULL,
  changed_at      timestamptz DEFAULT now()
  -- append only
);

CREATE TABLE academic_terms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid REFERENCES organizations(id) NOT NULL,
  name        text NOT NULL,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  is_active   boolean DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_terms_org ON academic_terms(org_id);
```

### Migration 002 — Profiles & Memberships
```sql
CREATE TABLE profiles (
  id                 uuid PRIMARY KEY REFERENCES auth.users(id),
  first_name         text NOT NULL,
  last_name          text NOT NULL,
  email              text UNIQUE NOT NULL,
  phone              text,
  avatar_url         text,
  graduation_year    int,
  major              text,
  bio                text,
  push_token         text,
  notification_prefs jsonb DEFAULT '{}',

  -- PLATFORM SUPERUSER
  -- Only set manually via Supabase dashboard or seed. Never exposed in the app UI.
  is_superuser       boolean DEFAULT false,
  superuser_since    timestamptz,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

-- Now add FK to org_branding_history
ALTER TABLE org_branding_history
  ADD CONSTRAINT fk_branding_history_changed_by
  FOREIGN KEY (changed_by) REFERENCES profiles(id);

CREATE TABLE memberships (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES profiles(id) NOT NULL,
  org_id              uuid REFERENCES organizations(id) NOT NULL,
  status              text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','inactive','alumni','suspended','pending','new_member')),
  is_blocked          boolean DEFAULT false,
  block_reason        text,
  blocked_at          timestamptz,
  blocked_by          uuid REFERENCES profiles(id),
  can_attend_events   boolean DEFAULT true,
  can_rsvp_events     boolean DEFAULT true,
  can_view_calendar   boolean DEFAULT true,
  can_submit_excuses  boolean DEFAULT true,
  dues_status         text NOT NULL DEFAULT 'current'
                        CHECK (dues_status IN ('current','overdue','delinquent','waived','payment_plan')),
  dues_balance        numeric(10,2) DEFAULT 0.00,
  dues_last_paid_at   timestamptz,
  dues_hold           boolean DEFAULT false,
  dues_hold_since     timestamptz,
  dues_hold_threshold numeric(10,2),
  joined_at           date,
  initiated_at        date,
  graduated_at        date,
  member_number       text,
  pin_number          text,
  is_visible          boolean DEFAULT true,
  is_deleted          boolean DEFAULT false,
  deleted_at          timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE(user_id, org_id)
);

CREATE TABLE membership_classes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid REFERENCES organizations(id) NOT NULL,
  name       text NOT NULL,
  term_id    uuid REFERENCES academic_terms(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE membership_class_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id      uuid REFERENCES membership_classes(id) NOT NULL,
  membership_id uuid REFERENCES memberships(id) NOT NULL,
  created_at    timestamptz DEFAULT now(),
  UNIQUE(class_id, membership_id)
);

CREATE INDEX idx_memberships_org    ON memberships(org_id);
CREATE INDEX idx_memberships_user   ON memberships(user_id);
CREATE INDEX idx_memberships_status ON memberships(status);
```

### Supabase Trigger — Auto-create profile on signup
```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, email, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

## 1.3 Branding Logic

- All hex color fields must pass validation: `^#[0-9A-Fa-f]{6}$`
- Before any branding update: snapshot current values into `org_branding_history`
- Mobile app reads org branding on login and stores in Zustand — apply as theme tokens across all screens
- `primary_color` → buttons, active states, headers
- `secondary_color` → badges, tags, secondary buttons
- `accent_color` → notifications, alerts, highlights
- `background_color` → screen backgrounds (dark/light override)
- `logo_url` → displayed in top nav, member app header
- `banner_url` → optional chapter home screen banner
- `app_display_name` → shown in mobile header instead of "Presnt"

## 1.4 FastAPI Setup

- [ ] Init FastAPI in `/api`
- [ ] Install: `fastapi uvicorn supabase python-dotenv pydantic sentry-sdk`
- [ ] Configure Supabase client with service role key (server-side only)
- [ ] Add Sentry init in `main.py`
- [ ] Add CORS middleware
- [ ] Create `/health` endpoint

## 1.5 Auth Flow (Mobile)

- [ ] Install `@supabase/supabase-js`, `expo-secure-store`
- [ ] Supabase client in `mobile/lib/supabase.ts` using `expo-secure-store` for session persistence
- [ ] Screens:
  - `(auth)/login.tsx`
  - `(auth)/register.tsx`
  - `(auth)/onboarding.tsx` — create or join chapter
- [ ] On login: fetch membership(s) + org branding → apply theme → redirect to role view

## 1.6 Chapter Onboarding Flow

- [ ] Create chapter screen: name, institution, Greek letter org, timezone, primary color, logo upload
  - Creates `organizations` row
  - Uploads logo to Supabase Storage → sets `logo_url`
  - Creates `memberships` row for creator (status = `active`)
  - Creates `academic_terms` for current semester
  - Creates `subscriptions` row (plan = `free`)
- [ ] Join chapter screen: search by name/slug, request pending approval
- [ ] Onboarding completes in under 10 minutes

## 1.7 Phase 1 API Routes

```
POST   /auth/register
POST   /auth/login
GET    /orgs/{org_id}
POST   /orgs                              # create chapter
PATCH  /orgs/{org_id}                     # update org settings
PATCH  /orgs/{org_id}/branding            # update colors, logo, banner
GET    /orgs/{org_id}/branding/history    # branding change log
GET    /orgs/{org_id}/members
POST   /orgs/{org_id}/members/invite
PATCH  /orgs/{org_id}/members/{membership_id}
GET    /orgs/{org_id}/terms
POST   /orgs/{org_id}/terms
```

---

# PHASE 2 — Roles, Entitlements & Custom Permissions
> Goal: Chapter admins can create fully custom roles with granular permissions. System defaults seed on org creation. Permission checks enforced on every action.

## 2.1 Database Migration

### Migration 003 — Permission Sets, Roles & Committees
```sql
-- PERMISSION SETS
-- org_id = NULL means system default (available to all orgs as a starting template)
-- org_id = set means org-specific custom set
CREATE TABLE permission_sets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid REFERENCES organizations(id),   -- NULL = system default
  name              text NOT NULL,
  description       text,
  is_system_default boolean DEFAULT false,
  is_locked         boolean DEFAULT false,               -- system defaults are locked, org sets are not
  based_on_id       uuid REFERENCES permission_sets(id), -- which system default this was cloned from
  permissions       jsonb NOT NULL DEFAULT '{}',
  -- permissions shape:
  -- {
  --   "events":     { "create", "edit_own", "edit_all", "delete", "close" },
  --   "attendance": { "manual_checkin", "override", "view_all", "view_own_committee" },
  --   "compliance": { "view_all", "view_own_committee", "export", "set_requirements" },
  --   "excuses":    { "submit", "approve", "escalate", "view_all" },
  --   "members":    { "add", "remove", "edit_roles", "view_contact_info", "view_compliance" },
  --   "settings":   { "edit_org", "manage_roles", "manage_branding", "billing" },
  --   "dues":       { "view_all", "record_payment", "apply_hold", "lift_hold", "waive" },
  --   "announcements": { "create", "send_push", "send_email" }
  -- }
  -- All values are boolean. Missing key = false.
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ORG ROLES
-- Each org creates its own named roles (e.g. "President", "Risk Chair")
-- and maps each to a permission set (either system default or custom)
CREATE TABLE org_roles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid REFERENCES organizations(id) NOT NULL,
  name              text NOT NULL,                        -- "President", "Risk Manager", etc.
  description       text,
  color             text,                                  -- hex, shown as badge in UI
  icon              text,                                  -- icon identifier for UI
  permission_set_id uuid REFERENCES permission_sets(id) NOT NULL,
  display_order     int DEFAULT 0,
  is_active         boolean DEFAULT true,
  is_deleted        boolean DEFAULT false,
  deleted_at        timestamptz,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  UNIQUE(org_id, name)
);

-- MEMBER ROLES
-- Links a membership to one or more org_roles
-- A member can hold multiple roles simultaneously
CREATE TABLE member_roles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid REFERENCES memberships(id) NOT NULL,
  org_role_id   uuid REFERENCES org_roles(id) NOT NULL,
  term_id       uuid REFERENCES academic_terms(id),       -- NULL = permanent/not term-scoped
  assigned_by   uuid REFERENCES profiles(id),
  assigned_at   timestamptz DEFAULT now(),
  expires_at    timestamptz,                               -- NULL = no expiry
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  UNIQUE(membership_id, org_role_id, term_id)
);

-- COMMITTEES
CREATE TABLE committees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid REFERENCES organizations(id) NOT NULL,
  name        text NOT NULL,
  description text,
  color       text,                                        -- hex, for calendar and UI
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE committee_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id  uuid REFERENCES committees(id) NOT NULL,
  membership_id uuid REFERENCES memberships(id) NOT NULL,
  is_chair      boolean DEFAULT false,
  created_at    timestamptz DEFAULT now(),
  UNIQUE(committee_id, membership_id)
);

-- ROLE CHANGE AUDIT (who assigned/removed what role and when)
CREATE TABLE role_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid REFERENCES organizations(id) NOT NULL,
  membership_id uuid REFERENCES memberships(id) NOT NULL,
  org_role_id   uuid REFERENCES org_roles(id) NOT NULL,
  action        text NOT NULL CHECK (action IN ('assigned','removed','expired')),
  performed_by  uuid REFERENCES profiles(id),
  reason        text,
  created_at    timestamptz DEFAULT now()
  -- append only
);

CREATE INDEX idx_member_roles_membership ON member_roles(membership_id);
CREATE INDEX idx_member_roles_active     ON member_roles(membership_id, is_active)
  WHERE is_active = true;
```

### Seed — System Default Permission Sets
```sql
INSERT INTO permission_sets (name, description, is_system_default, is_locked, permissions)
VALUES

('Executive', 'Full chapter access except billing', true, true, '{
  "events":        {"create":true,"edit_own":true,"edit_all":true,"delete":true,"close":true},
  "attendance":    {"manual_checkin":true,"override":true,"view_all":true,"view_own_committee":true},
  "compliance":    {"view_all":true,"view_own_committee":true,"export":true,"set_requirements":true},
  "excuses":       {"submit":true,"approve":true,"escalate":true,"view_all":true},
  "members":       {"add":true,"remove":true,"edit_roles":true,"view_contact_info":true,"view_compliance":true},
  "settings":      {"edit_org":true,"manage_roles":true,"manage_branding":true,"billing":false},
  "dues":          {"view_all":true,"record_payment":true,"apply_hold":true,"lift_hold":true,"waive":true},
  "announcements": {"create":true,"send_push":true,"send_email":true}
}'),

('Officer', 'Standard officer — create events, manage attendance, approve excuses', true, true, '{
  "events":        {"create":true,"edit_own":true,"edit_all":false,"delete":false,"close":true},
  "attendance":    {"manual_checkin":true,"override":false,"view_all":true,"view_own_committee":true},
  "compliance":    {"view_all":true,"view_own_committee":true,"export":true,"set_requirements":false},
  "excuses":       {"submit":true,"approve":true,"escalate":false,"view_all":true},
  "members":       {"add":false,"remove":false,"edit_roles":false,"view_contact_info":true,"view_compliance":true},
  "settings":      {"edit_org":false,"manage_roles":false,"manage_branding":false,"billing":false},
  "dues":          {"view_all":false,"record_payment":false,"apply_hold":false,"lift_hold":false,"waive":false},
  "announcements": {"create":true,"send_push":true,"send_email":false}
}'),

('Treasurer', 'Full dues and financial access, compliance view', true, true, '{
  "events":        {"create":false,"edit_own":false,"edit_all":false,"delete":false,"close":false},
  "attendance":    {"manual_checkin":false,"override":false,"view_all":true,"view_own_committee":false},
  "compliance":    {"view_all":true,"view_own_committee":false,"export":true,"set_requirements":false},
  "excuses":       {"submit":true,"approve":false,"escalate":false,"view_all":false},
  "members":       {"add":false,"remove":false,"edit_roles":false,"view_contact_info":true,"view_compliance":true},
  "settings":      {"edit_org":false,"manage_roles":false,"manage_branding":false,"billing":true},
  "dues":          {"view_all":true,"record_payment":true,"apply_hold":true,"lift_hold":true,"waive":true},
  "announcements": {"create":false,"send_push":false,"send_email":false}
}'),

('Committee Lead', 'Manage own committee events and attendance only', true, true, '{
  "events":        {"create":true,"edit_own":true,"edit_all":false,"delete":false,"close":false},
  "attendance":    {"manual_checkin":true,"override":false,"view_all":false,"view_own_committee":true},
  "compliance":    {"view_all":false,"view_own_committee":true,"export":false,"set_requirements":false},
  "excuses":       {"submit":true,"approve":false,"escalate":false,"view_all":false},
  "members":       {"add":false,"remove":false,"edit_roles":false,"view_contact_info":true,"view_compliance":false},
  "settings":      {"edit_org":false,"manage_roles":false,"manage_branding":false,"billing":false},
  "dues":          {"view_all":false,"record_payment":false,"apply_hold":false,"lift_hold":false,"waive":false},
  "announcements": {"create":true,"send_push":false,"send_email":false}
}'),

('Sergeant-at-Arms', 'Manual check-in only, no admin access', true, true, '{
  "events":        {"create":false,"edit_own":false,"edit_all":false,"delete":false,"close":false},
  "attendance":    {"manual_checkin":true,"override":false,"view_all":false,"view_own_committee":false},
  "compliance":    {"view_all":false,"view_own_committee":false,"export":false,"set_requirements":false},
  "excuses":       {"submit":true,"approve":false,"escalate":false,"view_all":false},
  "members":       {"add":false,"remove":false,"edit_roles":false,"view_contact_info":false,"view_compliance":false},
  "settings":      {"edit_org":false,"manage_roles":false,"manage_branding":false,"billing":false},
  "dues":          {"view_all":false,"record_payment":false,"apply_hold":false,"lift_hold":false,"waive":false},
  "announcements": {"create":false,"send_push":false,"send_email":false}
}'),

('Member', 'Standard member — own data only', true, true, '{
  "events":        {"create":false,"edit_own":false,"edit_all":false,"delete":false,"close":false},
  "attendance":    {"manual_checkin":false,"override":false,"view_all":false,"view_own_committee":false},
  "compliance":    {"view_all":false,"view_own_committee":false,"export":false,"set_requirements":false},
  "excuses":       {"submit":true,"approve":false,"escalate":false,"view_all":false},
  "members":       {"add":false,"remove":false,"edit_roles":false,"view_contact_info":false,"view_compliance":false},
  "settings":      {"edit_org":false,"manage_roles":false,"manage_branding":false,"billing":false},
  "dues":          {"view_all":false,"record_payment":false,"apply_hold":false,"lift_hold":false,"waive":false},
  "announcements": {"create":false,"send_push":false,"send_email":false}
}'),

('Alumni', 'Read-only observer, no action permissions', true, true, '{
  "events":        {"create":false,"edit_own":false,"edit_all":false,"delete":false,"close":false},
  "attendance":    {"manual_checkin":false,"override":false,"view_all":false,"view_own_committee":false},
  "compliance":    {"view_all":false,"view_own_committee":false,"export":false,"set_requirements":false},
  "excuses":       {"submit":false,"approve":false,"escalate":false,"view_all":false},
  "members":       {"add":false,"remove":false,"edit_roles":false,"view_contact_info":false,"view_compliance":false},
  "settings":      {"edit_org":false,"manage_roles":false,"manage_branding":false,"billing":false},
  "dues":          {"view_all":false,"record_payment":false,"apply_hold":false,"lift_hold":false,"waive":false},
  "announcements": {"create":false,"send_push":false,"send_email":false}
}');
```

## 2.2 Custom Role Flow (Admin Creates a New Role)

When a chapter admin creates a custom role:

1. Admin picks a **starting template** from system defaults (e.g. clone "Officer")
2. System creates a new `permission_sets` row with `org_id` set and `based_on_id` pointing to the template
3. Admin customizes individual permission toggles on the cloned set
4. Admin names the role (e.g. "New Member Educator", "Risk Manager", "Philanthropy Chair")
5. New `org_roles` row created pointing to the new `permission_sets` row
6. Admin assigns the role to members via `member_roles`

**Rules:**
- System defaults (`is_system_default = true`) are read-only. Admins can only clone them.
- Org-specific permission sets (`org_id` set) are fully editable by that org's admin.
- `billing` permission can only be toggled by Chapter Admin (system role) — never via custom role UI.
- Deleting a role: soft delete `org_roles.is_deleted = true`. `member_roles` rows are deactivated. Never cascade delete.

## 2.3 Permission Check Service (enforce on every route)

```python
# api/services/permissions.py

def get_member_permissions(membership_id: str, org_id: str) -> dict:
    """
    Returns merged permission set for a member.
    If member has multiple active roles, merge with OR logic
    (any true = true) across all their roles' permission sets.
    """
    active_roles = db.query("""
        SELECT ps.permissions
        FROM member_roles mr
        JOIN org_roles or_ ON mr.org_role_id = or_.id
        JOIN permission_sets ps ON or_.permission_set_id = ps.id
        WHERE mr.membership_id = %s
          AND mr.is_active = true
          AND (mr.expires_at IS NULL OR mr.expires_at > now())
    """, [membership_id])

    merged = {}
    for role in active_roles:
        for domain, perms in role['permissions'].items():
            if domain not in merged:
                merged[domain] = {}
            for perm, value in perms.items():
                merged[domain][perm] = merged[domain].get(perm, False) or value

    return merged


def require_permission(membership_id: str, org_id: str, domain: str, action: str):
    """
    Raises 403 if member does not have the required permission.
    Use as a dependency in FastAPI route handlers.
    """
    perms = get_member_permissions(membership_id, org_id)
    if not perms.get(domain, {}).get(action, False):
        raise HTTPException(status_code=403, detail=f"Missing permission: {domain}.{action}")


# Usage in a route:
# @router.post("/events/{event_id}/close")
# def close_event(event_id, membership_id = Depends(get_current_membership)):
#     require_permission(membership_id, org_id, "events", "close")
#     ...
```

## 2.4 Scoped Visibility (committee data isolation)

```python
def get_attendance_scope(membership_id: str, org_id: str) -> str:
    """
    Returns 'all' or 'committee' based on member's permissions.
    Used to filter attendance and compliance queries.
    """
    perms = get_member_permissions(membership_id, org_id)
    if perms.get('attendance', {}).get('view_all'):
        return 'all'
    if perms.get('attendance', {}).get('view_own_committee'):
        return 'committee'
    return 'own'  # member can only see their own records
```

## 2.5 Phase 2 API Routes

```
# Permission Sets
GET    /orgs/{org_id}/permission-sets              # list system defaults + org custom sets
POST   /orgs/{org_id}/permission-sets              # clone a system default + customize
PATCH  /orgs/{org_id}/permission-sets/{ps_id}      # update org-owned permission set
DELETE /orgs/{org_id}/permission-sets/{ps_id}      # soft delete (must reassign roles first)

# Org Roles
GET    /orgs/{org_id}/roles                        # list all roles with permission summary
POST   /orgs/{org_id}/roles                        # create custom role
PATCH  /orgs/{org_id}/roles/{role_id}              # rename, reorder, update color/icon
DELETE /orgs/{org_id}/roles/{role_id}              # soft delete

# Member Role Assignment
GET    /orgs/{org_id}/members/{membership_id}/roles
POST   /orgs/{org_id}/members/{membership_id}/roles      # assign role
DELETE /orgs/{org_id}/members/{membership_id}/roles/{member_role_id}  # remove role
GET    /orgs/{org_id}/roles/{role_id}/members            # who has this role

# Committees
GET    /orgs/{org_id}/committees
POST   /orgs/{org_id}/committees
PATCH  /orgs/{org_id}/committees/{committee_id}
POST   /orgs/{org_id}/committees/{committee_id}/members
DELETE /orgs/{org_id}/committees/{committee_id}/members/{membership_id}
```

## 2.6 Mobile Screens

- [ ] `(admin)/roles/index.tsx` — list all roles with permission badges
- [ ] `(admin)/roles/create.tsx` — pick template → customize toggles → name + color + icon
- [ ] `(admin)/roles/[id]/edit.tsx` — edit existing custom role permissions
- [ ] `(admin)/roles/[id]/members.tsx` — who holds this role
- [ ] `(admin)/members/[id]/roles.tsx` — assign/remove roles for a member
- [ ] `(admin)/committees/index.tsx` — manage committees
- [ ] `(admin)/committees/[id].tsx` — committee members + chair assignment

---

# PHASE 3 — Events & Basic Attendance
> Goal: Officers can create events, members view calendar, QR check-in works end to end.

## 3.1 Database Migrations

### Migration 004 — Event Categories & Events
```sql
CREATE TABLE event_categories (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid REFERENCES organizations(id) NOT NULL,
  name           text NOT NULL,
  default_points numeric(5,2) DEFAULT 1.0,
  is_mandatory   boolean DEFAULT false,
  color          text,
  icon           text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE TABLE events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid REFERENCES organizations(id) NOT NULL,
  term_id               uuid REFERENCES academic_terms(id),
  category_id           uuid REFERENCES event_categories(id),
  committee_id          uuid REFERENCES committees(id),
  created_by            uuid REFERENCES profiles(id) NOT NULL,
  title                 text NOT NULL,
  description           text,
  location_name         text,
  location_address      text,
  location_lat          numeric(10,7),
  location_lng          numeric(10,7),
  geofence_radius_m     int DEFAULT 100,
  starts_at             timestamptz NOT NULL,
  ends_at               timestamptz NOT NULL,
  check_in_opens_at     timestamptz,
  check_in_closes_at    timestamptz,
  is_mandatory          boolean DEFAULT false,
  points                numeric(5,2) DEFAULT 1.0,
  walkin_points         numeric(5,2),
  max_excuses           int,
  capacity              int,
  allow_guests          boolean DEFAULT false,
  max_guests_per_member int DEFAULT 0,
  status                text DEFAULT 'scheduled'
                          CHECK (status IN ('draft','scheduled','open','closed','cancelled')),
  check_in_method       text DEFAULT 'any'
                          CHECK (check_in_method IN ('any','geofence_only','qr_only','manual_only')),
  visibility            text DEFAULT 'members'
                          CHECK (visibility IN ('members','new_members_only','actives_only','committee_only')),
  recurrence_rule       text,
  parent_event_id       uuid REFERENCES events(id),
  is_deleted            boolean DEFAULT false,
  deleted_at            timestamptz,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE TABLE event_roles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid REFERENCES events(id) NOT NULL,
  membership_id uuid REFERENCES memberships(id) NOT NULL,
  role          text NOT NULL CHECK (role IN ('host','check_in_officer','override_officer')),
  created_at    timestamptz DEFAULT now(),
  UNIQUE(event_id, membership_id, role)
);

CREATE INDEX idx_events_org_term  ON events(org_id, term_id);
CREATE INDEX idx_events_starts_at ON events(starts_at);
CREATE INDEX idx_events_status    ON events(status);
```

### Migration 005 — Registration Settings & Registrations
```sql
CREATE TABLE event_registration_settings (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                     uuid REFERENCES events(id) NOT NULL UNIQUE,
  registration_enabled         boolean DEFAULT true,
  registration_opens_at        timestamptz,
  registration_closes_at       timestamptz,
  registration_capacity        int,
  waitlist_enabled             boolean DEFAULT false,
  waitlist_capacity            int,
  walkin_enabled               boolean DEFAULT true,
  walkin_requires_approval     boolean DEFAULT false,
  walkin_capacity              int,
  blocked_members_can_register boolean DEFAULT false,
  blocked_members_can_walkin   boolean DEFAULT false,
  guests_can_register          boolean DEFAULT false,
  guests_can_walkin            boolean DEFAULT false,
  max_guests_per_member        int DEFAULT 0,
  guest_registration_closes_at timestamptz,
  notify_on_registration       boolean DEFAULT false,
  notify_on_walkin             boolean DEFAULT false,
  reminder_hours_before        int DEFAULT 24,
  created_at                   timestamptz DEFAULT now(),
  updated_at                   timestamptz DEFAULT now()
);

CREATE TABLE registrations (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                  uuid REFERENCES events(id) NOT NULL,
  membership_id             uuid REFERENCES memberships(id) NOT NULL,
  status                    text NOT NULL DEFAULT 'registered'
                              CHECK (status IN ('registered','cancelled','waitlisted','approved','denied')),
  registered_at             timestamptz DEFAULT now(),
  registered_by             uuid REFERENCES profiles(id),
  registration_source       text DEFAULT 'self'
                              CHECK (registration_source IN ('self','officer','import','auto')),
  waitlist_position         int,
  promoted_from_waitlist_at timestamptz,
  guest_count               int DEFAULT 0,
  guest_names               text[],
  cancelled_at              timestamptz,
  cancelled_by              uuid REFERENCES profiles(id),
  cancellation_reason       text,
  approved_by               uuid REFERENCES profiles(id),
  approved_at               timestamptz,
  denial_reason             text,
  note                      text,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now(),
  UNIQUE(event_id, membership_id)
);

CREATE INDEX idx_registrations_event      ON registrations(event_id);
CREATE INDEX idx_registrations_membership ON registrations(membership_id);
CREATE INDEX idx_registrations_status     ON registrations(event_id, status);
CREATE INDEX idx_registrations_waitlist   ON registrations(event_id, waitlist_position)
  WHERE waitlist_position IS NOT NULL;
```

### Migration 006 — Attendance & Check-in
```sql
CREATE TABLE attendance_records (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id             uuid REFERENCES events(id) NOT NULL,
  membership_id        uuid REFERENCES memberships(id) NOT NULL,
  registration_id      uuid REFERENCES registrations(id),
  was_registered       boolean DEFAULT false,
  is_walkin            boolean DEFAULT false,
  status               text NOT NULL DEFAULT 'absent'
                         CHECK (status IN ('present','absent','excused','late','left_early','walkin_pending')),
  walkin_approved      boolean,
  walkin_approved_by   uuid REFERENCES profiles(id),
  walkin_approved_at   timestamptz,
  walkin_denial_reason text,
  check_in_method      text
                         CHECK (check_in_method IN ('geofence','qr','manual','override','walkin_qr','walkin_manual')),
  check_in_at          timestamptz,
  check_out_at         timestamptz,
  check_in_lat         numeric(10,7),
  check_in_lng         numeric(10,7),
  distance_from_event  numeric(8,2),
  points_earned        numeric(5,2) DEFAULT 0,
  points_override      numeric(5,2),
  points_override_by   uuid REFERENCES profiles(id),
  points_override_reason text,
  walkin_points_applied boolean DEFAULT false,
  manually_marked_by   uuid REFERENCES profiles(id),
  note                 text,
  is_guest             boolean DEFAULT false,
  guest_of             uuid REFERENCES memberships(id),
  guest_name           text,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  UNIQUE(event_id, membership_id)
);

CREATE TABLE check_in_qr_codes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid REFERENCES events(id) NOT NULL,
  code       text UNIQUE NOT NULL,
  created_by uuid REFERENCES profiles(id) NOT NULL,
  expires_at timestamptz NOT NULL,
  is_active  boolean DEFAULT true,
  scan_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_attendance_event_id       ON attendance_records(event_id);
CREATE INDEX idx_attendance_membership_id  ON attendance_records(membership_id);
CREATE INDEX idx_attendance_status         ON attendance_records(status);
CREATE INDEX idx_attendance_walkin_pending ON attendance_records(event_id, status)
  WHERE status = 'walkin_pending';
```

## 3.2 Check-in Business Logic

```python
def can_member_checkin(membership, event, event_settings):
    if membership.is_blocked:
        return False, "Your account is restricted. Contact your officer."
    if membership.dues_hold and not event_settings.blocked_members_can_walkin:
        return False, "You have an outstanding dues balance."
    active_restrictions = get_active_restrictions(membership.id)
    if any(r.blocks_event_attendance for r in active_restrictions):
        return False, active_restrictions[0].reason
    if event.status != 'open':
        return False, "Check-in is not currently open for this event."
    return True, None
```

## 3.3 QR Code Logic

- Officer opens event → `POST /events/{event_id}/qr` → creates `check_in_qr_codes` row, `expires_at = now() + 20min`
- Celery task rotates code every 20 minutes for all open events
- Member scans → `POST /attendance/qr-checkin` → validate not expired + `is_active = true` → upsert `attendance_records`
- On success: award points, enqueue compliance recalculation

## 3.4 Phase 3 API Routes

```
GET    /orgs/{org_id}/events
POST   /orgs/{org_id}/events
GET    /events/{event_id}
PATCH  /events/{event_id}
DELETE /events/{event_id}
POST   /events/{event_id}/open
POST   /events/{event_id}/close
POST   /events/{event_id}/qr
GET    /events/{event_id}/qr/current
POST   /events/{event_id}/register
DELETE /events/{event_id}/register
GET    /events/{event_id}/registrations
POST   /attendance/qr-checkin
POST   /attendance/manual-checkin
PATCH  /attendance/{record_id}
GET    /events/{event_id}/attendance
```

## 3.5 Mobile Screens

- [ ] `(member)/calendar.tsx`
- [ ] `(member)/event/[id].tsx`
- [ ] `(officer)/events/create.tsx`
- [ ] `(officer)/events/[id]/manage.tsx`
- [ ] `(officer)/events/[id]/qr.tsx`

---

# PHASE 4 — Compliance & Points
> Goal: Points tracked automatically, compliance dashboards live, at-risk warnings sent.

## 4.1 Database Migration

### Migration 007 — Compliance
```sql
CREATE TABLE compliance_requirements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid REFERENCES organizations(id) NOT NULL,
  term_id           uuid REFERENCES academic_terms(id) NOT NULL,
  name              text NOT NULL,
  applies_to        text DEFAULT 'all',
  category_id       uuid REFERENCES event_categories(id),
  min_points        numeric(6,2) NOT NULL,
  min_events        int,
  is_mandatory      boolean DEFAULT true,
  consequence       text,
  warning_threshold numeric(5,2),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE TABLE compliance_snapshots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id      uuid REFERENCES memberships(id) NOT NULL,
  term_id            uuid REFERENCES academic_terms(id) NOT NULL,
  requirement_id     uuid REFERENCES compliance_requirements(id) NOT NULL,
  points_earned      numeric(6,2) DEFAULT 0,
  points_required    numeric(6,2) NOT NULL,
  events_attended    int DEFAULT 0,
  events_required    int,
  is_compliant       boolean DEFAULT true,
  is_at_risk         boolean DEFAULT false,
  last_calculated_at timestamptz DEFAULT now(),
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),
  UNIQUE(membership_id, term_id, requirement_id)
);

CREATE TABLE compliance_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid REFERENCES organizations(id) NOT NULL,
  term_id      uuid REFERENCES academic_terms(id) NOT NULL,
  generated_by uuid REFERENCES profiles(id) NOT NULL,
  report_type  text NOT NULL CHECK (report_type IN ('end_of_term','midterm','custom','national_hq')),
  file_url     text,
  filters      jsonb,
  generated_at timestamptz DEFAULT now(),
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX idx_compliance_membership_term ON compliance_snapshots(membership_id, term_id);
CREATE INDEX idx_compliance_at_risk ON compliance_snapshots(is_at_risk) WHERE is_at_risk = true;
```

### Postgres Trigger — Enqueue compliance recalculation
```sql
CREATE OR REPLACE FUNCTION recalculate_compliance()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('compliance_recalc',
    json_build_object('membership_id', NEW.membership_id, 'event_id', NEW.event_id)::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_attendance_change
  AFTER INSERT OR UPDATE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION recalculate_compliance();
```

## 4.2 Compliance Calculation (Celery Task)

```python
@celery.task
def recalculate_compliance(membership_id: str, event_id: str):
    # 1. Get active term for org
    # 2. Get all compliance_requirements for term
    # 3. For each requirement:
    #    a. Sum points_earned from attendance_records (status = 'present' or 'excused')
    #       filtered by category_id if set
    #    b. Count events_attended
    #    c. Determine is_compliant and is_at_risk (below warning_threshold %)
    # 4. Upsert into compliance_snapshots
    # 5. If newly is_at_risk = true: enqueue push notification to member
```

## 4.3 Phase 4 API Routes

```
GET    /orgs/{org_id}/compliance
GET    /orgs/{org_id}/compliance/at-risk
GET    /members/{membership_id}/compliance
POST   /orgs/{org_id}/compliance/requirements
PATCH  /orgs/{org_id}/compliance/requirements/{id}
POST   /orgs/{org_id}/compliance/reports
GET    /orgs/{org_id}/compliance/reports
```

## 4.4 Mobile Screens

- [ ] `(member)/compliance.tsx`
- [ ] `(officer)/compliance/index.tsx`
- [ ] `(officer)/compliance/at-risk.tsx`
- [ ] `(admin)/compliance/requirements.tsx`

---

# PHASE 5 — Excuses & Appeals
> Goal: Members submit excuses, officers approve/deny/escalate, full audit trail.

## 5.1 Database Migration

### Migration 008 — Excuses
```sql
CREATE TABLE excuses (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_record_id uuid REFERENCES attendance_records(id) NOT NULL,
  membership_id        uuid REFERENCES memberships(id) NOT NULL,
  event_id             uuid REFERENCES events(id) NOT NULL,
  reason               text NOT NULL,
  supporting_docs      text[],
  submitted_at         timestamptz DEFAULT now(),
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','approved','denied','escalated','withdrawn')),
  reviewed_by          uuid REFERENCES profiles(id),
  reviewed_at          timestamptz,
  reviewer_note        text,
  escalated_to         uuid REFERENCES profiles(id),
  escalated_at         timestamptz,
  escalation_reason    text,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

CREATE TABLE excuse_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  excuse_id       uuid REFERENCES excuses(id) NOT NULL,
  changed_by      uuid REFERENCES profiles(id) NOT NULL,
  previous_status text,
  new_status      text,
  note            text,
  changed_at      timestamptz DEFAULT now()
  -- append only
);

CREATE INDEX idx_excuses_status ON excuses(status);
CREATE INDEX idx_excuses_event  ON excuses(event_id);
```

## 5.2 Business Logic

- Only submit if `membership.can_submit_excuses = true`
- Only submit for events where member was absent
- On approval: set `attendance_records.status = 'excused'`, award points, trigger compliance recalc
- Every status change appends a row to `excuse_audit_log` — never update existing rows

## 5.3 Phase 5 API Routes

```
POST   /excuses
GET    /excuses/{excuse_id}
PATCH  /excuses/{excuse_id}/approve
PATCH  /excuses/{excuse_id}/deny
PATCH  /excuses/{excuse_id}/escalate
PATCH  /excuses/{excuse_id}/withdraw
GET    /orgs/{org_id}/excuses
GET    /members/{membership_id}/excuses
```

## 5.4 Mobile Screens

- [ ] `(member)/excuses/submit.tsx`
- [ ] `(member)/excuses/history.tsx`
- [ ] `(officer)/excuses/index.tsx`
- [ ] `(officer)/excuses/[id].tsx`

---

# PHASE 6 — Member Restrictions & Dues
> Goal: Officers can block members, dues holds auto-apply, blocked members denied at every action.

## 6.1 Database Migration

### Migration 009 — Restrictions & Dues
```sql
CREATE TABLE member_restrictions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id            uuid REFERENCES memberships(id) NOT NULL,
  org_id                   uuid REFERENCES organizations(id) NOT NULL,
  restriction_type         text NOT NULL
                             CHECK (restriction_type IN ('dues_hold','manual_block','suspension','probation','inactive')),
  blocks_event_attendance  boolean DEFAULT true,
  blocks_event_rsvp        boolean DEFAULT true,
  blocks_calendar_view     boolean DEFAULT false,
  blocks_excuse_submission boolean DEFAULT false,
  blocks_voting            boolean DEFAULT false,
  blocks_app_access        boolean DEFAULT false,
  reason                   text NOT NULL,
  internal_note            text,
  created_by               uuid REFERENCES profiles(id) NOT NULL,
  starts_at                timestamptz NOT NULL DEFAULT now(),
  ends_at                  timestamptz,
  auto_lift_condition      text CHECK (auto_lift_condition IN ('dues_paid','officer_approval','term_end')),
  is_active                boolean DEFAULT true,
  lifted_by                uuid REFERENCES profiles(id),
  lifted_at                timestamptz,
  lift_reason              text,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);

CREATE TABLE dues_balances (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id     uuid REFERENCES memberships(id) NOT NULL,
  org_id            uuid REFERENCES organizations(id) NOT NULL,
  term_id           uuid REFERENCES academic_terms(id),
  amount_due        numeric(10,2) NOT NULL DEFAULT 0.00,
  amount_paid       numeric(10,2) NOT NULL DEFAULT 0.00,
  amount_waived     numeric(10,2) NOT NULL DEFAULT 0.00,
  balance           numeric(10,2) GENERATED ALWAYS AS (amount_due - amount_paid - amount_waived) STORED,
  due_date          date,
  grace_period_days int DEFAULT 14,
  grace_period_ends date GENERATED ALWAYS AS (due_date + grace_period_days) STORED,
  status            text NOT NULL DEFAULT 'unpaid'
                      CHECK (status IN ('unpaid','partial','paid','overdue','waived','payment_plan')),
  payment_plan      boolean DEFAULT false,
  payment_plan_terms jsonb,
  auto_hold_enabled boolean DEFAULT true,
  hold_threshold    numeric(10,2) DEFAULT 0.01,
  notes             text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  UNIQUE(membership_id, term_id)
);

CREATE TABLE dues_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dues_balance_id  uuid REFERENCES dues_balances(id) NOT NULL,
  membership_id    uuid REFERENCES memberships(id) NOT NULL,
  org_id           uuid REFERENCES organizations(id) NOT NULL,
  type             text NOT NULL
                     CHECK (type IN ('payment','charge','waiver','refund','adjustment','late_fee')),
  amount           numeric(10,2) NOT NULL,
  direction        text NOT NULL CHECK (direction IN ('credit','debit')),
  description      text NOT NULL,
  reference_id     text,
  payment_method   text CHECK (payment_method IN ('stripe','cash','check','venmo','manual')),
  recorded_by      uuid REFERENCES profiles(id) NOT NULL,
  transaction_date timestamptz DEFAULT now(),
  created_at       timestamptz DEFAULT now()
  -- append only
);

CREATE TABLE restriction_audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id  uuid REFERENCES memberships(id) NOT NULL,
  restriction_id uuid REFERENCES member_restrictions(id),
  org_id         uuid REFERENCES organizations(id) NOT NULL,
  action         text NOT NULL,
  performed_by   uuid REFERENCES profiles(id),
  reason         text,
  context        jsonb,
  created_at     timestamptz DEFAULT now()
  -- append only
);

CREATE INDEX idx_restrictions_membership_active ON member_restrictions(membership_id, is_active)
  WHERE is_active = true;
CREATE INDEX idx_dues_balances_membership ON dues_balances(membership_id);
CREATE INDEX idx_dues_balances_org_term   ON dues_balances(org_id, term_id);
```

### Postgres Trigger — Auto dues hold
```sql
CREATE OR REPLACE FUNCTION check_dues_hold()
RETURNS trigger AS $$
BEGIN
  IF NEW.auto_hold_enabled AND NEW.balance > NEW.hold_threshold
     AND NEW.status IN ('overdue','partial') THEN
    UPDATE memberships SET dues_hold = true, dues_hold_since = now(), dues_status = 'overdue'
    WHERE id = NEW.membership_id;
    INSERT INTO member_restrictions (membership_id, org_id, restriction_type, reason, created_by, auto_lift_condition, is_active)
    VALUES (NEW.membership_id, NEW.org_id, 'dues_hold', 'Outstanding dues balance.', NEW.membership_id, 'dues_paid', true);
  END IF;
  IF NEW.balance <= 0 THEN
    UPDATE memberships SET dues_hold = false, dues_status = 'current' WHERE id = NEW.membership_id;
    UPDATE member_restrictions SET is_active = false, lifted_at = now(), lift_reason = 'Dues paid in full'
    WHERE membership_id = NEW.membership_id AND restriction_type = 'dues_hold' AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_dues_balance_change
  AFTER UPDATE ON dues_balances
  FOR EACH ROW EXECUTE FUNCTION check_dues_hold();
```

## 6.2 Phase 6 API Routes

```
GET    /orgs/{org_id}/members/{membership_id}/restrictions
POST   /orgs/{org_id}/members/{membership_id}/restrictions
PATCH  /restrictions/{restriction_id}/lift
GET    /orgs/{org_id}/members/{membership_id}/dues
POST   /orgs/{org_id}/dues/balances
POST   /dues/{balance_id}/transactions
GET    /orgs/{org_id}/dues/overdue
```

## 6.3 Mobile Screens

- [ ] `(officer)/members/[id].tsx`
- [ ] `(officer)/members/[id]/restrict.tsx`
- [ ] `(officer)/dues/index.tsx`
- [ ] `(officer)/dues/[membership_id].tsx`
- [ ] `(member)/account/standing.tsx`

---

# PHASE 7 — Push Notifications & Announcements
> Goal: Members notified for check-in open, compliance warnings, excuse updates, dues holds.

## 7.1 Database Migration

### Migration 010 — Notifications & Announcements
```sql
CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES profiles(id) NOT NULL,
  org_id     uuid REFERENCES organizations(id),
  type       text NOT NULL,
  title      text NOT NULL,
  body       text NOT NULL,
  data       jsonb,
  is_read    boolean DEFAULT false,
  read_at    timestamptz,
  sent_via   text[],
  created_at timestamptz DEFAULT now()
);

CREATE TABLE announcements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid REFERENCES organizations(id) NOT NULL,
  created_by   uuid REFERENCES profiles(id) NOT NULL,
  title        text NOT NULL,
  body         text NOT NULL,
  audience     text DEFAULT 'all',
  pinned       boolean DEFAULT false,
  send_push    boolean DEFAULT true,
  send_email   boolean DEFAULT false,
  published_at timestamptz,
  expires_at   timestamptz,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;
```

## 7.2 Notification Triggers

| Event | Recipient | Type |
|-------|-----------|------|
| Event check-in opens | All eligible members | `check_in_open` |
| Excuse approved | Member | `excuse_approved` |
| Excuse denied | Member | `excuse_denied` |
| Excuse submitted | Approving officer | `excuse_submitted` |
| Compliance at risk | Member | `compliance_warning` |
| Dues hold applied | Member | `dues_hold_applied` |
| Walk-in pending | Check-in officer | `walkin_pending` |
| Event reminder | Registered members | `event_reminder` |
| Role assigned | Member | `role_assigned` |

## 7.3 Push Notification Setup

- [ ] Install `expo-notifications`
- [ ] Register device token on login → save to `profiles.push_token`
- [ ] Handle foreground + background notification receipt
- [ ] Deep link from notification `data` payload to relevant screen

## 7.4 Phase 7 API Routes

```
GET    /notifications
PATCH  /notifications/{id}/read
PATCH  /notifications/read-all
POST   /orgs/{org_id}/announcements
GET    /orgs/{org_id}/announcements
```

---

# PHASE 8 — Passive Geofence Check-In
> Goal: Members auto-checked-in on arrival. No app open required.

## 8.1 Mobile Setup

- [ ] Install `expo-location`, `expo-task-manager`
- [ ] Request `BACKGROUND` location permission on onboarding with clear explanation
- [ ] Define background task:

```typescript
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';

const GEOFENCE_TASK = 'PRESNT_GEOFENCE';

TaskManager.defineTask(GEOFENCE_TASK, ({ data: { eventType, region }, error }) => {
  if (error) return;
  if (eventType === Location.GeofencingEventType.Enter) {
    // POST /attendance/geofence-checkin { event_id: region.identifier }
  }
});
```

- [ ] When event opens: register geofence region using event `location_lat/lng` + `geofence_radius_m`
- [ ] When event closes: unregister geofence region
- [ ] Geofence enter → raw `geofence_events` row → Celery task processes into `attendance_records`

## 8.2 Database Migration

### Migration 011 — Geofence Events
```sql
CREATE TABLE geofence_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid REFERENCES events(id) NOT NULL,
  membership_id uuid REFERENCES memberships(id) NOT NULL,
  trigger_type  text NOT NULL CHECK (trigger_type IN ('enter','exit','dwell')),
  lat           numeric(10,7),
  lng           numeric(10,7),
  accuracy_m    numeric(8,2),
  triggered_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_geofence_event_member ON geofence_events(event_id, membership_id);
```

## 8.3 Celery Task — Process Geofence

```python
@celery.task
def process_geofence_event(geofence_event_id: str):
    # 1. Fetch geofence_event
    # 2. Validate event is still open
    # 3. Run can_member_checkin() — if restricted, log and return
    # 4. Calculate distance_from_event
    # 5. Upsert attendance_records (do not overwrite existing 'present' or 'manual' records)
    # 6. Award points
    # 7. Enqueue compliance recalculation
```

---

# PHASE 9 — Billing & Subscriptions
> Goal: Stripe live, plan tiers enforced via feature flags.

## 9.1 Database Migration

### Migration 012 — Billing & Feature Flags
```sql
CREATE TABLE subscriptions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid REFERENCES organizations(id) NOT NULL UNIQUE,
  stripe_subscription_id text UNIQUE,
  stripe_customer_id     text,
  plan                   text NOT NULL DEFAULT 'free'
                           CHECK (plan IN ('free','pro','council','hq')),
  status                 text NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','past_due','cancelled','trialing')),
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  trial_ends_at          timestamptz,
  cancelled_at           timestamptz,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

CREATE TABLE billing_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid REFERENCES organizations(id) NOT NULL,
  stripe_event_id text UNIQUE NOT NULL,
  event_type      text NOT NULL,
  payload         jsonb NOT NULL,
  processed_at    timestamptz DEFAULT now()
  -- append only
);

CREATE TABLE feature_flags (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key               text UNIQUE NOT NULL,
  description       text,
  enabled_globally  boolean DEFAULT false,
  enabled_for_plans text[],
  enabled_for_orgs  uuid[],
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);
```

### Seed — Feature Flags
```sql
INSERT INTO feature_flags (key, description, enabled_for_plans) VALUES
('geofence_checkin',    'Passive geofence check-in',          ARRAY['pro','council','hq']),
('compliance_export',   'PDF compliance report export',        ARRAY['pro','council','hq']),
('hq_rollup',          'National HQ multi-chapter dashboard', ARRAY['council','hq']),
('api_access',         'API access for integrations',         ARRAY['hq']),
('white_labeling',     'Custom branding and white-label',     ARRAY['hq']),
('advanced_analytics', 'Advanced analytics and reporting',    ARRAY['council','hq']),
('custom_roles',       'Create custom permission roles',      ARRAY['pro','council','hq']);
```

## 9.2 Stripe Setup

- [ ] Create products + prices: Pro $25/mo, Council $150/mo, HQ custom
- [ ] `POST /billing/create-checkout` — Stripe checkout session
- [ ] `POST /billing/webhook` — handle `customer.subscription.updated`, `invoice.paid`, `invoice.payment_failed`
- [ ] On webhook: update `subscriptions`, insert `billing_events`
- [ ] Gate features in middleware using `feature_flags`

## 9.3 Phase 9 API Routes

```
POST   /billing/create-checkout
POST   /billing/portal
POST   /billing/webhook
GET    /orgs/{org_id}/subscription
```

---

# PHASE 10 — Audit Log & Compliance Reports
> Goal: All sensitive actions logged, PDF compliance reports generated for nationals.

## 10.1 Database Migration

### Migration 013 — Audit Log
```sql
CREATE TABLE audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid REFERENCES organizations(id),
  user_id        uuid REFERENCES profiles(id),
  action         text NOT NULL,
  resource_type  text NOT NULL,
  resource_id    uuid NOT NULL,
  previous_value jsonb,
  new_value      jsonb,
  ip_address     inet,
  user_agent     text,
  created_at     timestamptz DEFAULT now()
  -- append only
);

CREATE INDEX idx_audit_log_org      ON audit_log(org_id);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);
```

## 10.2 Actions to Log

```
attendance.override        attendance.manual_checkin
excuse.approved            excuse.denied
member.blocked             member.unblocked
member.removed             member.role_assigned
dues.hold_applied          dues.hold_lifted
dues.transaction           event.closed
org.branding_updated       role.created
role.permission_changed    role.deleted
```

## 10.3 PDF Report (Celery Task)

```python
@celery.task
def generate_compliance_report(org_id, term_id, filters, generated_by):
    # 1. Query compliance_snapshots for term
    # 2. Join profiles, memberships, requirements
    # 3. Render HTML template with WeasyPrint
    # 4. Upload PDF to Supabase Storage
    # 5. Insert compliance_reports row with file_url
    # 6. Notify requesting officer that report is ready
```

## 10.4 Phase 10 API Routes

```
POST   /orgs/{org_id}/compliance/reports
GET    /orgs/{org_id}/compliance/reports
GET    /compliance/reports/{report_id}
GET    /orgs/{org_id}/audit-log
```

---

# PHASE 11 — Officer Handoff & HQ Rollup
> Goal: Officer transition under 10 minutes. National HQ sees all chapters.

## 11.1 Officer Handoff Flow

- [ ] `(admin)/handoff.tsx` — end-of-term wizard:
  1. Deactivate outgoing officer `member_roles`
  2. Select + assign incoming officers (new `member_roles` rows for new term)
  3. Generate handoff briefing: attendance stats, compliance rates, open excuses, dues outstanding
  4. New officers receive push notification with context summary
- [ ] All org data persists through handoff

## 11.2 HQ Rollup (council/hq plan only, gated by `hq_rollup` feature flag)

- [ ] HQ org queries child orgs via `parent_org_id`
- [ ] `GET /orgs/{hq_org_id}/chapters` — all chapters
- [ ] `GET /orgs/{hq_org_id}/rollup/compliance` — aggregate compliance across chapters
- [ ] `GET /orgs/{hq_org_id}/rollup/attendance` — aggregate attendance rates
- [ ] `POST /orgs/{hq_org_id}/rollup/report` — multi-chapter PDF

## 11.3 Mobile Screens

- [ ] `(admin)/handoff/index.tsx`
- [ ] `(admin)/hq/dashboard.tsx`
- [ ] `(admin)/hq/chapters.tsx`

---

# Global Rules for Agent

1. **Permission check before every write** — call `require_permission(membership_id, org_id, domain, action)` before any route that modifies data.
2. **Restriction check before attendance/registration writes** — call `can_member_checkin()` or `can_member_register()` before inserting.
3. **Never compute compliance in a route handler** — always read `compliance_snapshots`. Recalc is async via Celery.
4. **Every status change has an audit entry** — excuses, restrictions, dues holds, attendance overrides, role changes, branding updates all write to their respective log table.
5. **Append-only tables** — `dues_transactions`, `excuse_audit_log`, `role_audit_log`, `restriction_audit_log`, `billing_events`, `org_branding_history`, `audit_log` never receive UPDATE or DELETE.
6. **Soft deletes everywhere** — `is_deleted = true`, `deleted_at = now()`. Filter `WHERE is_deleted = false` in all queries.
7. **All timestamps UTC** — never store local time. Convert at response layer using org timezone.
8. **RLS is the security layer** — never rely on application logic alone to restrict data access.
15. **Superuser bypasses everything** — `is_superuser = true` bypasses all RLS, org permissions, and feature flags. Every superuser action must write to `superuser_audit_log` before returning. No exceptions.
16. **`is_superuser` is never grantable via API** — only direct database access. No route, no admin UI, no onboarding flow can set this field.
9. **QR codes expire** — validate `expires_at > now()` and `is_active = true` before every QR scan.
10. **Registration ≠ attendance** — missing registration never blocks check-in unless `walkin_enabled = false`.
11. **Most restrictive restriction wins** — query ALL active restrictions and apply most restrictive combination.
12. **Custom permission sets are clones** — admins can never edit system defaults. Always clone then customize.
13. **Multiple roles merge with OR** — if a member holds two roles, they get the union of all permissions across both sets.
14. **Branding changes are logged** — always snapshot `org_branding_history` before updating any color, logo, or display name field.

---

# PHASE 12 — Platform Superuser (You)
> Goal: A single God-mode account that can read and write everything across all orgs, view all logs, impersonate any org for debugging, and manage the platform itself.

## 12.1 What the Superuser Is

The superuser is **not** an org role. It is a platform-level flag (`profiles.is_superuser = true`) that bypasses all RLS, all org-scoped permissions, and all feature flag gates. It is set manually — never through the app UI. There is no way for any chapter admin or member to grant or discover superuser status.

There should only ever be one or two superuser accounts. Treat them like production database credentials.

## 12.2 How to Grant Superuser Access

Set directly in Supabase dashboard or via a one-time seed script. Never via an API route.

```sql
-- Run in Supabase SQL editor. Replace with your actual user UUID.
UPDATE profiles
SET is_superuser = true, superuser_since = now()
WHERE id = '<your-profile-uuid>';
```

To find your UUID after registering:
```sql
SELECT id, email FROM profiles WHERE email = 'your@email.com';
```

## 12.3 Superuser RLS Bypass

Add this policy to every table so superusers bypass all row-level restrictions:

```sql
-- Apply this pattern to every table after creation
-- Example for organizations:
CREATE POLICY "superuser_bypass" ON organizations
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_superuser = true
    )
  );
```

Create a helper function to keep policies DRY:

```sql
CREATE OR REPLACE FUNCTION is_superuser()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND is_superuser = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Then each table just uses:
-- CREATE POLICY "superuser_bypass" ON <table> USING (is_superuser());
```

## 12.4 Superuser Middleware (FastAPI)

```python
# api/dependencies/auth.py

def get_current_user(token: str = Depends(oauth2_scheme)):
    user = supabase.auth.get_user(token)
    profile = db.query("SELECT * FROM profiles WHERE id = %s", [user.id])
    return profile

def require_superuser(current_user = Depends(get_current_user)):
    if not current_user.get('is_superuser'):
        raise HTTPException(status_code=403, detail="Superuser access required.")
    return current_user

# Usage on any superuser-only route:
# @router.get("/superadmin/orgs")
# def list_all_orgs(su = Depends(require_superuser)):
#     ...
```

## 12.5 Superuser Action Log

All superuser actions write to a dedicated log. Separate from the org-level `audit_log` so there is always a clean record of platform-level changes.

### Migration 014 — Superuser Audit Log
```sql
CREATE TABLE superuser_audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_by   uuid REFERENCES profiles(id) NOT NULL,
  action         text NOT NULL,
  -- e.g. 'org.force_deactivated', 'member.impersonated', 'subscription.overridden',
  --      'feature_flag.toggled', 'org.branding_reset', 'billing.plan_changed'
  target_type    text,             -- 'org', 'profile', 'membership', 'subscription', etc.
  target_id      uuid,
  previous_value jsonb,
  new_value      jsonb,
  notes          text,
  ip_address     inet,
  created_at     timestamptz DEFAULT now()
  -- append only. No updates. No deletes. Ever.
);

CREATE INDEX idx_superuser_audit_performer ON superuser_audit_log(performed_by);
CREATE INDEX idx_superuser_audit_target    ON superuser_audit_log(target_type, target_id);
CREATE INDEX idx_superuser_audit_created   ON superuser_audit_log(created_at DESC);
```

Every superuser route **must** write to `superuser_audit_log` before returning. No exceptions.

## 12.6 Superuser Capabilities & Routes

### Org Management
```
GET    /superadmin/orgs                          # list all orgs, any status
GET    /superadmin/orgs/{org_id}                 # full org detail inc. billing + branding
PATCH  /superadmin/orgs/{org_id}                 # edit any org field
POST   /superadmin/orgs/{org_id}/deactivate      # force deactivate org
POST   /superadmin/orgs/{org_id}/reactivate
DELETE /superadmin/orgs/{org_id}                 # hard delete (last resort only)
```

### Member & Profile Management
```
GET    /superadmin/profiles                      # search all users across all orgs
GET    /superadmin/profiles/{profile_id}
PATCH  /superadmin/profiles/{profile_id}         # edit any profile field
POST   /superadmin/profiles/{profile_id}/impersonate  # generate a scoped token to act as user
POST   /superadmin/profiles/{profile_id}/reset-password
```

### Subscription & Billing Overrides
```
GET    /superadmin/subscriptions                 # all subscriptions across all orgs
PATCH  /superadmin/subscriptions/{org_id}        # manually override plan/status
POST   /superadmin/subscriptions/{org_id}/grant-pro    # grant Pro without Stripe
POST   /superadmin/subscriptions/{org_id}/revoke-pro
```

### Feature Flag Management
```
GET    /superadmin/feature-flags
PATCH  /superadmin/feature-flags/{key}           # toggle globally or per org
POST   /superadmin/feature-flags/{key}/enable-for-org/{org_id}
DELETE /superadmin/feature-flags/{key}/org/{org_id}
```

### Platform Logs (read-only)
```
GET    /superadmin/logs/superuser                # superuser_audit_log
GET    /superadmin/logs/audit                    # all org audit_logs across all orgs
GET    /superadmin/logs/billing                  # all billing_events
GET    /superadmin/logs/restrictions             # all restriction_audit_logs
GET    /superadmin/logs/errors                   # Sentry error feed (proxied)
```

### Org Data Access (read-only for debugging)
```
GET    /superadmin/orgs/{org_id}/members
GET    /superadmin/orgs/{org_id}/events
GET    /superadmin/orgs/{org_id}/attendance
GET    /superadmin/orgs/{org_id}/compliance
GET    /superadmin/orgs/{org_id}/excuses
GET    /superadmin/orgs/{org_id}/dues
GET    /superadmin/orgs/{org_id}/restrictions
GET    /superadmin/orgs/{org_id}/audit-log
```

## 12.7 Impersonation

Lets you act as any user in any org for debugging without knowing their password.

```python
@router.post("/superadmin/profiles/{profile_id}/impersonate")
def impersonate_user(profile_id: str, su = Depends(require_superuser)):
    # 1. Generate a short-lived Supabase token scoped to the target user
    token = supabase.auth.admin.generate_link(type='magiclink', email=target_email)

    # 2. Log it — always
    insert_superuser_audit_log(
        performed_by=su.id,
        action='member.impersonated',
        target_type='profile',
        target_id=profile_id,
        notes=f"Impersonation token generated"
    )

    # 3. Return short-lived token (expires in 15 minutes)
    return { "token": token, "expires_in": 900 }
```

**Rules:**
- Impersonation tokens expire in 15 minutes
- Every impersonation writes to `superuser_audit_log`
- Impersonation is read-only by default — destructive actions during impersonation require an explicit `?force=true` query param which itself gets logged

## 12.8 Superuser Web Dashboard

Build as a **separate web app** — not part of the mobile app. Keep it completely isolated.

```
superadmin.presnt.com   (or localhost:3001 in dev)
```

- [ ] Separate Next.js or React app in `/superadmin` directory
- [ ] Auth: same Supabase project, but login page checks `is_superuser = true` — redirects to 403 if not
- [ ] Never ship superadmin routes or UI inside the main mobile app bundle
- [ ] Screens:
  - `Dashboard` — total orgs, active subscriptions, MRR, recent errors
  - `Orgs` — searchable list of all chapters with status, plan, member count
  - `Org Detail` — full read/write access to all org data
  - `Users` — search all profiles, view membership history
  - `Feature Flags` — toggle flags globally or per org
  - `Billing` — subscription overrides, Stripe status
  - `Logs` — tabbed view of all audit logs across all tables
  - `Impersonate` — look up user → generate token → open in test browser tab

## 12.9 Security Rules for Superuser

- `is_superuser` is never returned in any API response that non-superuser clients can access
- There is no API route to set `is_superuser = true` — only direct DB access
- Superuser accounts must use a strong password + MFA enforced in Supabase Auth settings
- Superuser sessions expire after 1 hour (set shorter JWT expiry for superuser accounts)
- All `/superadmin/*` routes are rate-limited to 60 requests/minute
- Superadmin web app is on a separate subdomain, not bundled in the mobile app
- Never log or return raw `is_superuser` values in error messages or API responses

