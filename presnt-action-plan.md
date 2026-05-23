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

# PHASE 0 — App Shell, Theme & Navigation
> Goal: Blank app with a working navigation structure, design system, and theme engine ready before any feature work begins.

## 0.1 Expo & Project Config

- [x] Confirm `app.json` has correct `name`, `slug`, `scheme`, `ios.bundleIdentifier`, `android.package`
- [x] Set up `babel.config.js` with path aliases (`@/components`, `@/lib`, `@/stores`, `@/types`)
- [x] Configure `tsconfig.json` with strict mode + path aliases matching Babel config
- [x] Set up `.env` with `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`
- [x] Add `react-native-dotenv` or `expo-constants` for env var access

## 0.2 Dependencies

Install all core dependencies up front so they don't interrupt feature phases:

```bash
# Navigation
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar

# UI & Styling
npx expo install react-native-reanimated react-native-gesture-handler

# State
npm install zustand

# Supabase
npm install @supabase/supabase-js
npx expo install expo-secure-store

# Utilities
npx expo install expo-image expo-haptics @expo/vector-icons
```

## 0.3 Design Tokens & Theme System

Create `mobile/lib/theme.ts` — the single source of truth for all visual constants:

```typescript
export const defaultTheme = {
  colors: {
    primary:    '#6366f1',
    secondary:  '#a5b4fc',
    accent:     '#f472b6',
    background: '#0f0f1a',
    surface:    '#1a1a2e',
    surfaceAlt: '#16213e',
    text:       '#ffffff',
    textMuted:  '#94a3b8',
    textSubtle: '#475569',
    border:     '#1e293b',
    error:      '#ef4444',
    warning:    '#f59e0b',
    success:    '#22c55e',
  },
  typography: {
    fontFamily: {
      regular: 'System',
      medium:  'System',
      bold:    'System',
    },
    size: {
      xs:  11,
      sm:  13,
      md:  15,
      lg:  17,
      xl:  20,
      xxl: 26,
      h1:  32,
    },
    lineHeight: {
      tight:  1.2,
      normal: 1.5,
      loose:  1.8,
    },
  },
  spacing: {
    xs:  4,
    sm:  8,
    md:  16,
    lg:  24,
    xl:  32,
    xxl: 48,
  },
  radius: {
    sm:   6,
    md:   12,
    lg:   18,
    full: 9999,
  },
  shadow: {
    sm: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4,  elevation: 2 },
    md: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8,  elevation: 4 },
    lg: { shadowColor: '#000', shadowOpacity: 0.2,  shadowRadius: 16, elevation: 8 },
  },
};

export type AppTheme = typeof defaultTheme;
```

## 0.4 Theme Store (Zustand)

Create `mobile/stores/themeStore.ts`:

```typescript
// Org branding from Supabase overrides default tokens at login.
// defaultTheme is the fallback used before branding loads.
import { create } from 'zustand';
import { defaultTheme, AppTheme } from '@/lib/theme';

interface ThemeStore {
  theme: AppTheme;
  setOrgBranding: (branding: Partial<AppTheme['colors']>) => void;
  reset: () => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: defaultTheme,
  setOrgBranding: (branding) =>
    set((state) => ({
      theme: { ...state.theme, colors: { ...state.theme.colors, ...branding } },
    })),
  reset: () => set({ theme: defaultTheme }),
}));
```

## 0.5 Core UI Components

Build these once. Every feature phase uses them — never inline raw styles.

| Component | File | Notes |
|-----------|------|-------|
| `Button` | `components/ui/Button.tsx` | variants: primary, secondary, ghost, danger |
| `Text` | `components/ui/Text.tsx` | wraps RN Text, pulls from theme typography |
| `Card` | `components/ui/Card.tsx` | themed surface container with optional shadow |
| `Input` | `components/ui/Input.tsx` | labeled, error state, themed border |
| `Badge` | `components/ui/Badge.tsx` | small color pill for status labels |
| `Avatar` | `components/ui/Avatar.tsx` | image with fallback initials |
| `Divider` | `components/ui/Divider.tsx` | horizontal rule from theme border color |
| `ScreenContainer` | `components/ui/ScreenContainer.tsx` | safe area + background color wrapper |
| `Header` | `components/ui/Header.tsx` | top nav bar — logo/title, optional right action |
| `EmptyState` | `components/ui/EmptyState.tsx` | icon + message for empty lists |
| `LoadingSpinner` | `components/ui/LoadingSpinner.tsx` | centered activity indicator |

All components accept a `style` override prop. None hard-code colors or spacing.


## 0.6 Navigation Structure

Set up all route groups now so file creation during feature phases just fills in screens:

```
mobile/app/
├── _layout.tsx               # Root layout — loads theme, checks auth, redirects
├── (auth)/
│   ├── _layout.tsx           # No tab bar, no header
│   ├── login.tsx
│   ├── register.tsx
│   └── onboarding.tsx
├── (member)/
│   ├── _layout.tsx           # Bottom tab bar: Home, Calendar, Status, Profile
│   ├── index.tsx             # Home / announcements feed
│   ├── calendar.tsx
│   ├── status.tsx
│   ├── profile.tsx
│   └── event/[id].tsx
├── (officer)/
│   ├── _layout.tsx           # Bottom tab bar: Events, Attendance, Excuses, Members
│   ├── events/
│   ├── attendance/
│   ├── excuses/
│   └── members/
└── (admin)/
  ├── _layout.tsx           # Bottom tab bar: Dashboard, Members, Roles, Settings
  ├── dashboard.tsx
  ├── members/
  ├── roles/
  ├── committees/
  ├── dues/
  ├── status/
  └── settings.tsx
```

Root `_layout.tsx` logic:
1. Check for active Supabase session
2. If no session → redirect to `/(auth)/login`
3. If session → load membership + org branding → apply to theme store → redirect to role-appropriate tab group

## 0.7 Placeholder Screens

Add a placeholder to every route above so navigation works end-to-end before features are built:

```typescript
// Example placeholder — same pattern for every screen
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Text } from '@/components/ui/Text';

export default function CalendarScreen() {
  return (
    <ScreenContainer>
      <Text>Calendar — coming soon</Text>
    </ScreenContainer>
  );
}
```

## 0.8 Phase 0 Checklist

- [x] `app.json` configured
- [x] Path aliases working (`@/` resolves)
- [x] All dependencies installed, no Expo SDK conflicts
- [x] `theme.ts` created with full default token set
- [x] `themeStore.ts` created
- [x] All core UI components scaffolded (can be minimal stubs)
- [x] All route groups and `_layout.tsx` files created
- [x] Placeholder screen in every route
- [x] App boots, navigation works, no red screens
- [x] Theme tokens visibly applied (background color, text color correct)

---

# PHASE 1 — Foundation, Auth & Org Branding
> Goal: Supabase running, auth working, chapter onboarding under 10 minutes, org branding fully configurable.

## 1.1 Supabase Setup

- [x] Create Supabase project
- [x] Enable email auth — Google OAuth not yet connected
- [ ] Set JWT expiry to 7 days (manual step in Supabase dashboard)
- [x] Enable RLS on all tables from creation

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

## 1.4 API Server Setup
> ⚠ Stack divergence: built with **Express + Node.js** (in `artifacts/api-server/`) instead of FastAPI. All equivalent functionality delivered.

- [x] Express server initialized with TypeScript + esbuild
- [x] CORS middleware configured
- [x] `/health` endpoint live
- [x] JWT verification via JWKS (RS256) — no service role key needed
- [x] Drizzle ORM connected to Supabase Postgres via `DATABASE_URL`
- [ ] Sentry error monitoring not yet added

## 1.5 Auth Flow (Mobile)

- [x] Install `@supabase/supabase-js`, `expo-secure-store`
- [x] Supabase client in `lib/supabase.ts` with platform-aware storage (SecureStore on native, localStorage on web)
- [x] Screens:
  - `(auth)/login.tsx`
  - `(auth)/register.tsx`
  - `(auth)/onboarding.tsx` — create or join chapter
- [x] On login: fetch membership(s) + org branding → apply theme tokens → redirect to member home
- [x] Email confirmation flow handled (shows "check your email" if session is null)

## 1.6 Chapter Onboarding Flow

- [x] Create chapter screen: name, institution, Greek letter org, timezone
  - [x] Creates `organizations` row
  - [ ] Logo upload to Supabase Storage (not yet implemented)
  - [x] Creates `memberships` row for creator (status = `active`)
  - [x] Creates `academic_terms` for current semester
  - [ ] Creates `subscriptions` row (billing pending)
- [x] Join chapter screen: search by name, request pending approval
- [x] Onboarding completes in under 10 minutes

# 1.7 Phase 1 API Routes

```
POST   /auth/register                     ← handled by Supabase Auth directly
POST   /auth/login                        ← handled by Supabase Auth directly
GET    /orgs/{org_id}                     ✓
POST   /orgs                              ← org created client-side via Supabase insert
PATCH  /orgs/{org_id}                     ✓
PATCH  /orgs/{org_id}/branding            ✓ (hex color validation included)
GET    /orgs/{org_id}/branding/history    ✗ not yet implemented
GET    /orgs/{org_id}/members             ✓
POST   /orgs/{org_id}/members/invite      ✗ not yet implemented
PATCH  /orgs/{org_id}/members/{membership_id}  ✓
GET    /orgs/{org_id}/terms               ✓
POST   /orgs/{org_id}/terms               ✓
```

## 1.8 Rename Compliance to Status in Mobile App

- [x] Update all references to "compliance" in the mobile app layout, navigation, and screen names to "status"
- [x] `(member)/compliance.tsx` → `(member)/status.tsx`
- [x] `(admin)/compliance/index.tsx` → `(admin)/status/index.tsx`
- [x] Navigation tab labels updated from "Compliance" to "Status"

---

# PHASE 1.5 — Super User Platform Dashboard
> Goal: A God-mode operator dashboard — web + mobile — where the platform founder can monitor every org, override billing, manage feature flags, debug incidents, and impersonate any user. Built early so the platform is fully observable while all other phases are being constructed.
>
> **Security posture:** The superuser app is completely isolated from the chapter-facing mobile app. It lives at `superadmin.presnt.app` (or `localhost:3001` in dev), runs in a separate Expo web or Next.js build, and is gated by `profiles.is_superuser = true`. This flag is set only via Supabase SQL — no API route can grant it. Every action writes to `superuser_audit_log` before returning.

---

## 1.5.0 What the Superuser Is & Architecture

The superuser is **not** an org role. It is a platform-level flag (`profiles.is_superuser = true`) that bypasses all RLS, all org-scoped permissions, and all feature flag gates. It is set manually — never through the app UI. There is no way for any chapter admin or member to grant or discover superuser status. There should only ever be one or two superuser accounts. Treat them like production database credentials.

### Granting Superuser Access

Set directly in Supabase dashboard or via a one-time seed script. **Never via an API route.**

```sql
-- Run in Supabase SQL editor. Replace with your actual user UUID.
UPDATE profiles
SET is_superuser = true, superuser_since = now()
WHERE id = '<your-profile-uuid>';

-- To find your UUID after registering:
SELECT id, email FROM profiles WHERE email = 'your@email.com';
```

### App Architecture

The superuser UI is built inside the **existing Expo app** as a new route group `(superuser)/`, protected by a guard in `_layout.tsx` that redirects non-superusers to a 403 screen. On web (≥ 800 px) it renders the dark sidebar layout shown in the mockups. On mobile it renders a bottom-tab shell with the same screens.

> **Deployment note:** While the superuser route group lives in the same Expo codebase, it is deployed on a separate subdomain (`superadmin.presnt.app`) and never shipped as part of the chapter-facing mobile bundle. The route group guard is the first line of defense; Supabase RLS and the `require_superuser` FastAPI dependency are the enforcement layer.

```
app/
└── (superuser)/
    ├── _layout.tsx                   # auth guard + responsive layout (sidebar on web, tabs on mobile)
    ├── index.tsx                     # Overview / Platform Dashboard
    ├── orgs/
    │   ├── index.tsx                 # Orgs list — searchable table
    │   └── [org_id]/
    │       ├── index.tsx             # Org detail
    │       ├── settings.tsx          # Field editor
    │       └── impersonate.tsx       # Impersonate org admin view
    ├── users/
    │   ├── index.tsx                 # Users list — cross-org search
    │   └── [profile_id]/
    │       ├── index.tsx             # User detail + membership history
    │       └── editor.tsx            # Edit name, email, force logout
    ├── billing/                      # (pending) — Stripe integration not yet built
    │   ├── index.tsx                 # Subscriptions table
    │   ├── overrides.tsx             # Manual plan overrides
    │   ├── failed.tsx                # Past-due orgs
    │   └── webhooks.tsx              # Stripe webhook log
    ├── flags/
    │   ├── index.tsx                 # All feature flags + global state
    │   └── [key].tsx                 # Flag editor — global toggle + per-org overrides
    ├── logs/
    │   ├── index.tsx                 # Platform audit log (superuser_audit_log)
    │   ├── org/[org_id].tsx          # Single org audit trail
    │   ├── restrictions.tsx          # All member blocks/holds across all orgs
    │   ├── excuses.tsx               # Cross-org excuse log
    │   ├── billing.tsx               # Raw Stripe webhook payloads
    │   └── errors.tsx                # Error log (Sentry feed or direct query)
    ├── support/
    │   ├── excuse-override.tsx       # Manually approve/deny any excuse
    │   ├── attendance-override.tsx   # Correct bad attendance records
    │   ├── compliance-recalc.tsx     # Trigger recalculation for member or org
    │   ├── qr-inspector.tsx          # Look up any QR code + scan history
    │   └── push-tester.tsx           # Send test push to any device token
    └── config/
        ├── permission-sets.tsx       # View system defaults, see org clones
        ├── flag-defaults.tsx         # Set which plans get which flags
        ├── email-templates.tsx       # Preview + edit Resend notification templates
        └── app-config.tsx            # Platform-level settings (geofence radius, QR interval, etc.)
```

---

## 1.5.1 Database — Superuser Audit Log & RLS Bypass

### Migration 014 — Superuser Audit Log

This migration is prerequisite to everything else in 1.5. Apply before building any superuser screen.

```sql
CREATE TABLE superuser_audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_by   uuid REFERENCES profiles(id) NOT NULL,
  action         text NOT NULL,
  -- action values used in UI:
  --   'org.viewed', 'org.deactivated', 'org.reactivated', 'org.field_edited', 'org.impersonated'
  --   'profile.viewed', 'profile.edited', 'profile.force_logged_out', 'profile.impersonated'
  --   'subscription.plan_overridden', 'subscription.pro_granted', 'subscription.pro_revoked'
  --   'feature_flag.toggled_global', 'feature_flag.org_override_added', 'feature_flag.org_override_removed'
  --   'support.excuse_overridden', 'support.attendance_overridden', 'support.compliance_recalculated'
  --   'support.qr_inspected', 'support.push_sent'
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

### RLS Bypass Pattern

Add this policy pattern to every table so superusers bypass all row-level restrictions:

```sql
-- Helper function — keeps policies DRY
CREATE OR REPLACE FUNCTION is_superuser()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND is_superuser = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Apply to each table after creation:
-- CREATE POLICY "superuser_bypass" ON <table> USING (is_superuser());

-- Example for organizations:
CREATE POLICY "superuser_bypass" ON organizations
  USING (is_superuser());
```

---

## 1.5.2 Layout & Navigation Shell

### Desktop (≥ 800 px)
Dark sidebar (`#1C1411` bg) + top bar + content area. Matches the mockup exactly.

**Sidebar structure:**
```
[p] presnt                         ← orange square icon + wordmark
    SUPER USER                     ← role label, xs muted uppercase

Overview       ← active = orange sq bg + orange icon + white text
Orgs
Users
Billing
Feature flags
Logs & audit
Support tools
App config

─────────────────────────────
[S] S. Admin
    platform@presnt.app
```

**Top bar (right-aligned):**
- Search input: "Search orgs, users, events, errors…"
- `● All systems healthy` — green pill badge (polling `/superadmin/health`)
- 🔔 Bell icon (notifications)
- ⚙ Settings icon

### Mobile (< 800 px)
```
PLATFORM                    ← xs muted uppercase
Super User                  ← xl bold
                [🔔] [S]    ← bell + avatar circle (no top bar search)
```
Bottom tabs: Overview · Orgs · Billing · Logs · More (opens sheet with Users, Flags, Support, Config)

### Auth Guard (in `_layout.tsx`)
```typescript
// On mount: fetch profile.is_superuser
// If false or missing → render <SuperuserGate /> (dark 403 screen, no navigation leaked)
// If true → render layout with sidebar/tabs
// Superuser sessions expire in 1 hour — check token age on every focus event
```

---

## 1.5.3 Screen Specs

### Overview — Platform Dashboard

**Header row:**
- `PLATFORM OVERVIEW` (xs, uppercase, muted)
- `Good morning, {firstName}.` (h1, bold, white)
- `{Day}, {Date} · {N} orgs serving {N} members` (sm, muted)
- **Right actions:** `Export report` (outline) · `+ Impersonate org` (primary orange)

**Stat cards row (5 across on desktop, 3 then 2 on mobile):**

| Card | Value | Sub-label | Notes |
|------|-------|-----------|-------|
| MRR | `$24,820` | `+12% mo` | Orange filled card bg |
| ACTIVE ORGS | `240` | `+8 this wk` | Dark surface card |
| TOTAL USERS | `18,420` | `+142 today` | Dark surface card |
| FAILED PAYMENTS | `3` | `$420 at risk` (red) | Dark surface card |
| ERROR RATE | `0.12%` | `last 24h` | Dark surface card |

**Growth chart panel:**
- Title: `Growth · MRR & orgs` + `Past 12 months`
- Time toggles: `1M · 3M · 6M · 12M · All` (12M active/orange by default)
- Area chart: two lines — MRR (orange fill) and org count (dashed gray)
- Use `react-native-svg` paths or a simple sparkline — no external chart library required in skeleton

**System health panel (right column on desktop, below chart on mobile):**
```
System health
● API          142ms
● Postgres       8ms
● Celery queue  12 jobs
```
- Green dot = healthy, yellow = degraded, red = down
- Polling `/superadmin/health` every 30 seconds

**Quick-access cards (2-row grid, 4 per row on desktop):**
```
[icon] Org management        [icon] User management      [icon] Billing           [icon] Feature flags
       240 chapters · 5 deactivated  18.4k profiles             $24.8k MRR · 3 past due  14 flags · 2 in beta  [badge: 3]

[icon] Support tools         [icon] Logs & audit         [icon] App config        [icon] Analytics
       Overrides · QR · push tester  Platform · per-org · billing  Templates · defaults · limits  Churn · adoption · cohorts
```
Each card is a `Pressable` → navigates to the corresponding section.

---

### Orgs — List

**Header:** `Orgs` (h1) + search input (full width) + `+ New org` button (rare — mostly for seeding)

**Filter bar:** `All` · `Active` · `Inactive` · `Past Due` · `Free` · `Pro` · `Council`

**Table (desktop) / Card list (mobile):**

| Column | Notes |
|--------|-------|
| Org name + slug | bold name, muted slug below |
| Plan badge | `FREE` `PRO` `COUNCIL` `HQ` — colored pills |
| Members | count |
| Last active | relative time |
| Status | `● Active` (green) / `● Inactive` (red) / `● Past Due` (yellow) |
| Actions | `View` button → Org Detail |

- Infinite scroll or pagination (50 per page)
- Search: debounced 300ms, hits `GET /superadmin/orgs?search={q}`
- Tap row → Org Detail

---

### Org Detail — `[org_id]/index.tsx`

**Header:** back arrow + org name + `Edit` (outline) · `Deactivate` (danger outline) or `Reactivate` · `Impersonate` (primary)

**Info sections (card-based):**

```
IDENTITY
  Name            Kappa Sigma
  Slug            kappa-sigma-ucla
  Type            chapter
  Institution     UCLA
  Greek org       Kappa Sigma
  Timezone        America/Los_Angeles
  Founded         2001

BRANDING
  Primary color   [● #E26B4A] swatch + hex
  Logo URL        preview thumbnail
  App display     Kappa Sigma

SUBSCRIPTION
  Plan            PRO
  Status          active
  MRR             $25.00/mo
  Next renewal    Jun 1, 2026
  Stripe ID       sub_xxxxx

USAGE
  Members         142
  Events (30d)    8
  Compliance rate 87%
  Last active     2h ago
```

**Member list tab:** paginated table of all members in org (name, status, joined_at)

**Event list tab:** recent events in org (title, date, attendance count)

**Audit log tab:** most recent 50 entries from `audit_log` filtered to this org

---

### Org Settings Editor — `[org_id]/settings.tsx`

- Form with all editable org fields (same fields as Org Detail info panel but all are text inputs / pickers)
- Color pickers for branding fields (show hex input + color swatch preview)
- Logo upload (Supabase Storage)
- `Save changes` → `PATCH /superadmin/orgs/{org_id}` → writes `superuser_audit_log`
- `Subscription override` section: plan dropdown + reason field → `PATCH /superadmin/subscriptions/{org_id}`
- `Deactivate org` — shows a modal with required `reason` field + confirmation input of org name before submitting

---

### Org Impersonate — `[org_id]/impersonate.tsx`

- Shows the org's Chapter Admin view rendered inside a safe iframe / embedded navigator with a red "IMPERSONATING" banner at the top
- On mobile: navigates into the chapter admin route group with an injected impersonation token; injects a visible overlay badge
- `Exit impersonation` button always visible in top-right corner
- Impersonation token: 15-min expiry, generated by `POST /superadmin/orgs/{org_id}/impersonate`
- Every action inside impersonation is tagged with the superuser's ID in `superuser_audit_log`

**API implementation:**
```python
@router.post("/superadmin/profiles/{profile_id}/impersonate")
def impersonate_user(profile_id: str, su = Depends(require_superuser)):
    target = db.query("SELECT email FROM profiles WHERE id = %s", [profile_id])
    # Generate a short-lived magic link token for the target user
    token = supabase.auth.admin.generate_link(type='magiclink', email=target['email'])

    # Always log before returning
    insert_superuser_audit_log(
        performed_by=su['id'],
        action='profile.impersonated',
        target_type='profile',
        target_id=profile_id,
        notes="Impersonation token generated"
    )

    # Return 15-minute token
    return { "token": token, "expires_in": 900 }

# Same pattern for org-level impersonation:
@router.post("/superadmin/orgs/{org_id}/impersonate")
def impersonate_org_admin(org_id: str, su = Depends(require_superuser)):
    # Find the chapter admin profile for this org
    admin = db.query("""
        SELECT p.email, p.id FROM profiles p
        JOIN memberships m ON m.user_id = p.id
        JOIN member_roles mr ON mr.membership_id = m.id
        JOIN org_roles or_ ON mr.org_role_id = or_.id
        WHERE m.org_id = %s AND or_.name = 'Chapter Admin' AND mr.is_active = true
        LIMIT 1
    """, [org_id])
    token = supabase.auth.admin.generate_link(type='magiclink', email=admin['email'])
    insert_superuser_audit_log(performed_by=su['id'], action='org.impersonated',
        target_type='org', target_id=org_id, notes="Org admin impersonation token generated")
    return { "token": token, "expires_in": 900 }
```

**Rules:**
- Impersonation is read-only by default. Destructive actions during impersonation require an explicit `?force=true` param which itself gets logged.
- 15-minute countdown timer is shown in the persistent red banner. Auto-exits on expiry.

---

### Users — List

**Header:** `Users` (h1) + global search + filter: `All orgs` dropdown, `Status` dropdown, `Plan` dropdown

**Table / card list:**

| Column | Notes |
|--------|-------|
| Avatar + Name + Email | Avatar component + bold name + muted email |
| Org(s) | comma-joined org names (may belong to multiple) |
| Plan | highest plan across memberships |
| Joined | date |
| Push token | `● registered` (green) / `○ none` (muted) |
| Actions | `View` |

---

### User Detail — `[profile_id]/index.tsx`

**Profile card:**
- Large avatar, name, email, phone, pronouns, graduation year, major
- `Edit` button → User Editor
- `Force logout` button (invalidates all sessions) → `POST /superadmin/profiles/{id}/force-logout`
- `Reset password` button → `POST /superadmin/profiles/{id}/reset-password`
- `Impersonate` button → generates 15-min token, opens sandboxed tab

**Memberships section:**
- List of all orgs this user belongs to
- Each row: org name, plan, membership status, role(s), joined date
- `View in org` → navigates to Org Detail

**Login history:**
- Last 10 sign-in events (timestamp, IP, device)
- Pulled from Supabase auth admin API

**Push token status:**
- Current token string (truncated)
- `Send test push` → opens push tester pre-filled with this user's token

---

### User Editor — `[profile_id]/editor.tsx`

- Form: first name, last name, email (with warning that changing email affects auth), phone, pronouns, graduation year, major, bio
- `Save` → `PATCH /superadmin/profiles/{id}` → logs to `superuser_audit_log`
- Email change: shows warning modal ("Changing email will update their Supabase auth identity. They'll need to log in again.")

---

### Billing — Subscriptions List *(pending)*

**Header:** `Billing` + `$24,820 MRR` stat chip + `3 past due` warning chip

**Tabs:** `All subscriptions` · `Failed payments` · `Stripe webhooks`

**All subscriptions table:**

| Column | Notes |
|--------|-------|
| Org | name + slug |
| Plan | colored badge |
| Status | `active` `past_due` `cancelled` `trialing` |
| MRR | dollar amount |
| Next renewal | date |
| Stripe sub ID | truncated, copyable |
| Actions | `Override plan` |

**Failed payments tab:**
- Orgs where `subscription.status = 'past_due'`
- Days overdue, amount at risk, last payment attempt date
- Contact email of chapter admin
- `Retry payment` / `Grant grace period` actions

**Stripe webhook log tab:**
- Paginated list of `billing_events` rows
- Each row: event type, timestamp, org, processed status
- Expand row → full JSON payload viewer

---

### Feature Flags — List

**Header:** `Feature flags` + `14 flags · 2 in beta` sub-label + `+ New flag` button

**Table:**

| Column | Notes |
|--------|-------|
| Key | monospace text |
| Description | muted text |
| Global | toggle switch |
| Plans | `FREE` `PRO` `COUNCIL` `HQ` pills — highlighted if enabled |
| Org overrides | count of orgs with non-standard state |
| Actions | `Edit` |

**Flag Detail / Editor — `flags/[key].tsx`:**
- Flag key (read-only) + description (editable)
- `Enabled globally` toggle
- Plan checkboxes: `Free · Pro · Council · HQ`
- **Per-org overrides section:**
  - List of orgs where flag state differs from plan default
  - Each row: org name, override state (enabled/disabled), who set it, when
  - `+ Add org override` → org search → toggle → saves to `feature_flags.enabled_for_orgs[]`
  - `Remove override` → removes org from the array
- Save → `PATCH /superadmin/feature-flags/{key}` + audit log

---

### Logs & Audit

**Tab navigation:** `Platform audit` · `Org audit` · `Restrictions` · `Excuses` · `Billing events` · `Errors`

**Platform audit tab:**
- All rows from `superuser_audit_log`, newest first
- Filter by: `action type` dropdown, `performed_by` (always the superuser), date range
- Each row: timestamp, action (colored by type), target type + ID, notes
- Expand row → full `previous_value` / `new_value` JSON diff viewer

**Org audit tab:**
- Org picker (search + select) → shows `audit_log` filtered to that org
- Same row format as platform audit

**Restrictions tab:**
- All `member_restrictions` + `restriction_audit_log` across all orgs
- Filter by: org, restriction type, active only toggle
- Each row: org, member name, type, reason, started, ends, active status

**Excuses tab:**
- All `excuses` across all orgs (read-only overview)
- Filter by: org, status (pending/approved/denied), date range
- Useful for debugging "stuck" excuse records

**Billing events tab:**
- All `billing_events` rows (raw Stripe payloads)
- Filter by: event type, org, processed status
- Expand → JSON viewer for full payload

**Error log tab:**
- Embedded Sentry error feed — link to Sentry project or proxied via `GET /superadmin/logs/errors`
- Filter by org_id tag (if errors are tagged with org context)
- Shortcut to open full Sentry dashboard

---

### Support Tools

**Excuse Override — `support/excuse-override.tsx`**
- Step 1: Search for org → search for member → select event → select excuse record
- Step 2: Shows excuse details (reason, docs, current status)
- Step 3: `Approve` or `Deny` + required `reason` field
- Submits → `PATCH /superadmin/support/excuses/{excuse_id}` → writes audit log
- Warning banner: "This bypasses officer review. The member will be notified."

**Attendance Override — `support/attendance-override.tsx`**
- Search org → member → event → shows current attendance record
- Edit: status dropdown (`present` / `absent` / `excused` / `late`) + reason field
- `Save` → `PATCH /superadmin/support/attendance/{record_id}` → triggers compliance recalc + audit log
- Warning: "Changing attendance will recalculate this member's compliance score."

**Compliance Recalculate — `support/compliance-recalc.tsx`**
- Mode picker: `Single member` or `Entire org`
- Single: org picker → member search → `Recalculate` button
- Org: org picker → `Recalculate all members` button + confirmation
- Submits → `POST /superadmin/support/compliance/recalculate`
- Shows progress / last calculated timestamps

**QR Code Inspector — `support/qr-inspector.tsx`**
- Search input: paste any QR code value
- Result shows:
  - Event it belongs to (name, date, org)
  - Created by, created at
  - `expires_at` — was it valid at time of scan?
  - `is_active` current state
  - `scan_count`
  - Scan history: timestamp, membership, distance from event, result (success/fail)
- Useful for debugging "my QR didn't work" reports

**Push Notification Tester — `support/push-tester.tsx`**
- Token input (paste a device token or search by user)
- Title input + body input + data JSON input (optional)
- `Send test push` → `POST /superadmin/support/push/test`
- Shows delivery result (Expo push service response)
- Audit log entry written for every test push sent

---

### Content & Config

**System Permission Sets — `config/permission-sets.tsx`**
- Read-only list of all `permission_sets` where `is_system_default = true`
- For each: name, description, full permission grid (domain × action checkboxes, all read-only)
- Below each system default: `{N} orgs have cloned this set` — tap to see which orgs

**Feature Flag Defaults — `config/flag-defaults.tsx`**
- Table: flag key, which plans it's on by default (editable checkboxes)
- Saving → `PATCH /superadmin/feature-flags/{key}` with updated `enabled_for_plans[]`
- Changes here affect all new orgs on that plan; existing orgs get the new state on next login

**Email Templates — `config/email-templates.tsx`**
- List of all Resend notification templates (keyed by notification type)
- Each template: `View` opens a HTML preview panel, `Edit` opens a code + preview split view
- Save → `PATCH /superadmin/config/email-templates/{key}` → deploys updated template to Resend

**App Config — `config/app-config.tsx`**
- Form with platform-level constants:

| Setting | Default | Notes |
|---------|---------|-------|
| Max geofence radius (m) | 500 | Cap for all orgs |
| QR rotation interval (min) | 20 | How often QR codes rotate |
| Check-in grace period (min) | 15 | How late after close members can still check in |
| Excuse submission window (days) | 7 | After event, how long to submit |
| Max org logo size (KB) | 512 | Storage upload limit |
| Free plan member cap | 50 | Members before forced upgrade |
| Session timeout (min) | 60 | Superuser session expiry |

- Save → `PATCH /superadmin/config/app` → writes each key to a `platform_config` table

---

## 1.5.4 Database — Platform Config Table

```sql
-- Stores all platform-level configuration key-value pairs.
-- Superuser edits these via App Config screen.
CREATE TABLE platform_config (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  description text,
  updated_by  uuid REFERENCES profiles(id),
  updated_at  timestamptz DEFAULT now()
  -- never hard-delete. To reset: set value back to default.
);

-- Seed with defaults
INSERT INTO platform_config (key, value, description) VALUES
('max_geofence_radius_m',       '500',   'Maximum geofence radius in meters for any org'),
('qr_rotation_interval_min',    '20',    'Minutes between automatic QR code rotation'),
('checkin_grace_period_min',    '15',    'Minutes after event close that check-in still works'),
('excuse_submission_window_d',  '7',     'Days after event that a member can submit an excuse'),
('max_logo_size_kb',            '512',   'Maximum org logo upload size in KB'),
('free_plan_member_cap',        '50',    'Member count limit for free plan orgs'),
('superuser_session_timeout_m', '60',    'Superuser session expiry in minutes');
```

---

## 1.5.5 API Routes (all under `/superadmin/` prefix, require `is_superuser`)

```
# Health
GET    /superadmin/health

# Org management
GET    /superadmin/orgs
GET    /superadmin/orgs/{org_id}
PATCH  /superadmin/orgs/{org_id}
POST   /superadmin/orgs/{org_id}/deactivate
POST   /superadmin/orgs/{org_id}/reactivate
POST   /superadmin/orgs/{org_id}/impersonate
DELETE /superadmin/orgs/{org_id}                 # hard delete — last resort only, requires double confirmation

# Org data (read-only debug access)
GET    /superadmin/orgs/{org_id}/members
GET    /superadmin/orgs/{org_id}/events
GET    /superadmin/orgs/{org_id}/attendance
GET    /superadmin/orgs/{org_id}/compliance
GET    /superadmin/orgs/{org_id}/excuses
GET    /superadmin/orgs/{org_id}/dues
GET    /superadmin/orgs/{org_id}/restrictions
GET    /superadmin/orgs/{org_id}/audit-log

# User management
GET    /superadmin/profiles
GET    /superadmin/profiles/{profile_id}
PATCH  /superadmin/profiles/{profile_id}
POST   /superadmin/profiles/{profile_id}/impersonate
POST   /superadmin/profiles/{profile_id}/reset-password
POST   /superadmin/profiles/{profile_id}/force-logout

# Billing
GET    /superadmin/subscriptions
PATCH  /superadmin/subscriptions/{org_id}
POST   /superadmin/subscriptions/{org_id}/grant-pro
POST   /superadmin/subscriptions/{org_id}/revoke-pro
GET    /superadmin/billing/failed
GET    /superadmin/billing/webhooks

# Feature flags
GET    /superadmin/feature-flags
PATCH  /superadmin/feature-flags/{key}
POST   /superadmin/feature-flags/{key}/org/{org_id}
DELETE /superadmin/feature-flags/{key}/org/{org_id}

# Logs
GET    /superadmin/logs/platform           # superuser_audit_log
GET    /superadmin/logs/org/{org_id}       # org-specific audit_log
GET    /superadmin/logs/restrictions
GET    /superadmin/logs/excuses
GET    /superadmin/logs/billing
GET    /superadmin/logs/errors

# Support tools
PATCH  /superadmin/support/excuses/{excuse_id}
PATCH  /superadmin/support/attendance/{record_id}
POST   /superadmin/support/compliance/recalculate
GET    /superadmin/support/qr/{code}
POST   /superadmin/support/push/test

# Config
GET    /superadmin/config/app
PATCH  /superadmin/config/app
GET    /superadmin/config/permission-sets
GET    /superadmin/config/email-templates
PATCH  /superadmin/config/email-templates/{key}
```

---

## 1.5.5.1 FastAPI Superuser Middleware

Add this dependency to every `/superadmin/*` route. Never skip it.

```python
# api/dependencies/auth.py

def get_current_user(token: str = Depends(oauth2_scheme)):
    """Validate JWT and return profile row."""
    user = supabase.auth.get_user(token)
    profile = db.query("SELECT * FROM profiles WHERE id = %s", [user.id])
    return profile

def require_superuser(current_user = Depends(get_current_user)):
    """
    Raises 403 if the authenticated user is not a platform superuser.
    Use as a FastAPI dependency on every /superadmin/* route.
    """
    if not current_user.get('is_superuser'):
        raise HTTPException(status_code=403, detail="Superuser access required.")
    return current_user

# Usage on any superuser route:
# @router.get("/superadmin/orgs")
# def list_all_orgs(su = Depends(require_superuser)):
#     insert_superuser_audit_log(performed_by=su['id'], action='org.viewed', ...)
#     ...
```

All `/superadmin/*` routes are rate-limited to **60 requests/minute** per IP.

---

## 1.5.6 UI Design Tokens for Superuser App

The superuser app uses its own dark color palette — distinct from org branding so there's no confusion when impersonating.

```typescript
export const superuserTheme = {
  bg:         '#1C1411',   // sidebar + screen backgrounds
  surface:    '#272018',   // card surfaces
  surfaceAlt: '#332820',   // active sidebar item, hover states
  text:       '#FBF6EE',   // primary text
  textMuted:  '#A89687',   // secondary text, labels
  textSubtle: '#6E5E54',   // placeholders, disabled
  border:     '#3D2B22',   // card borders, dividers
  primary:    '#E26B4A',   // CTA buttons, active nav, highlights
  danger:     '#C0392B',   // deactivate, delete, error states
  warning:    '#C99432',   // past-due, at-risk indicators
  success:    '#5C8A57',   // healthy status, active indicators
  info:       '#3B82F6',   // informational badges
};
```

Impersonation mode overlays a persistent `4px top border` in `danger` red + a floating `IMPERSONATING {orgName}` banner that cannot be dismissed — always visible.

---

## 1.5.7 Security Rules

### UI Layer
- Superuser route group checks `is_superuser` on every screen mount — does not trust the layout guard alone
- All destructive actions (deactivate org, force logout, plan override) require:
  1. Confirmation modal with action description
  2. Text field where superuser types the target name or `CONFIRM` to proceed
  3. Mandatory `reason` field (logged verbatim in audit log)
- Impersonation: 15-minute countdown timer shown in the banner; auto-exits when token expires
- No `is_superuser` value is displayed anywhere in the superuser UI — the presence of the UI itself is the indicator
- Every form `Save` is disabled until a change is actually made (no accidental saves)
- Tab-switching away from a dirty form shows "Unsaved changes" warning

### API & Database Layer
- `is_superuser` is **never returned** in any API response that non-superuser clients can access — never include it in member/officer API payloads
- There is no API route to set `is_superuser = true` — only direct Supabase SQL editor or seed script
- Superuser accounts must use a strong password + **MFA enforced** in Supabase Auth settings (Authentication → Users → enable MFA requirement for superuser emails)
- Superuser sessions expire after **1 hour** — set shorter JWT expiry for superuser accounts in Supabase Auth settings
- All `/superadmin/*` routes are **rate-limited to 60 requests/minute**
- Superadmin web app is on a **separate subdomain** (`superadmin.presnt.app`) and is not bundled in the chapter-facing mobile app
- Never log or return raw `is_superuser` values in error messages or API responses
- Every `/superadmin/*` route writes to `superuser_audit_log` before returning — no exceptions, no shortcuts

---

## 1.5.8 Phase 1.5 Checklist

- [x] `(superuser)/_layout.tsx` — auth guard + responsive shell (dark sidebar on web, tabs on mobile)
- [x] `(superuser)/index.tsx` — Overview dashboard (stat cards, system health, quick-access grid)
- [x] `(superuser)/orgs/index.tsx` — searchable org list with Active/Inactive filters
- [x] `(superuser)/orgs/[org_id]/index.tsx` — org detail with Info / Members / Audit tabs
- [x] `(superuser)/orgs/[org_id]/settings.tsx` — org field editor (name, institution, branding)
- [ ] `(superuser)/orgs/[org_id]/impersonate.tsx` — impersonation view with red banner
- [x] `(superuser)/users/index.tsx` — cross-org user search
- [x] `(superuser)/users/[profile_id]/index.tsx` — user detail + membership history
- [x] `(superuser)/users/[profile_id]/editor.tsx` — user editor
- [x] `(superuser)/billing/index.tsx` — *(pending)* placeholder shown
- [ ] `(superuser)/billing/failed.tsx` — past-due orgs *(pending)*
- [ ] `(superuser)/billing/webhooks.tsx` — Stripe webhook log *(pending)*
- [x] `(superuser)/flags/index.tsx` — feature flags list with global toggles
- [ ] `(superuser)/flags/[key].tsx` — per-org overrides editor
- [x] `(superuser)/logs/index.tsx` — platform audit log (reads live from `superuser_audit_log`)
- [ ] `(superuser)/logs/org/[org_id].tsx` — per-org audit trail
- [x] Restrictions tab stubbed in logs screen
- [x] Errors tab stubbed in logs screen
- [x] `(superuser)/support/index.tsx` — QR inspector + push tester (accordion); attendance/excuse/compliance stubbed
- [x] `(superuser)/config/index.tsx` — live `platform_config` editor (reads + writes Supabase)
- [ ] `(superuser)/config/permission-sets.tsx` — system defaults viewer
- [ ] `(superuser)/config/email-templates.tsx` — email template editor
- [x] `platform_config` table created + seeded with 7 defaults
- [x] `superuser_audit_log` table created with indexes + RLS
- [x] `is_superuser()` SQL function + RLS bypass policies on all core tables
- [x] All `/superadmin/*` routes added to Express with `requireSuperuser` middleware
- [x] Key routes write to `superuser_audit_log` before returning
- [ ] Impersonation token flow (requires Supabase service role — deferred)
- [x] Destructive actions (org deactivate/reactivate) require confirmation Alert + reason

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
- [ ] `(member)/status.tsx`
- [ ] `(officer)/events/create.tsx`
- [ ] `(officer)/events/[id]/manage.tsx`
- [ ] `(officer)/events/[id]/qr.tsx`
- [ ] `(officer)/status/index.tsx`
- [ ] `(officer)/status/at-risk.tsx`
- [ ] `(admin)/status/requirements.tsx`

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

- [ ] `(member)/status.tsx`
- [ ] `(officer)/status/index.tsx`
- [ ] `(officer)/status/at-risk.tsx`
- [ ] `(admin)/status/requirements.tsx`

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

# PHASE 12 — Platform Superuser
> **Merged into Phase 1.5.** All superuser infrastructure — database schema, RLS bypass, FastAPI middleware, API routes, UI screens, impersonation, and security rules — is fully specified in **Phase 1.5 — Super User Platform Dashboard**. Build it in Phase 1.5 order; there is nothing left here that is not already covered there.

