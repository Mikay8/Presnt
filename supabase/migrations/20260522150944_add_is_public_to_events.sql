-- Add is_public flag to events.
-- Public events get a shareable URL at presnt.app/c/[org_slug]/events/[event_code].
-- Private events (default) are still visible to authenticated members in-app
-- but have no public link and the event_code is cleared on save.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

-- Existing events that already have an event_code set are back-filled as public
-- so their existing public links keep working.
UPDATE events
  SET is_public = true
  WHERE event_code IS NOT NULL;
