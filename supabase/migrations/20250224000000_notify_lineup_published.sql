-- Lineup Master: Push notification on lineup publish (Phase 6)
-- Run this in Supabase SQL Editor to enable notifications when lineup is published from WEB.
-- Mobile publishes already trigger notifications via LineupEditorScreen.

-- Trigger: when lineup_formations.status changes from draft to published,
-- insert notif_history for all team members (players + parents).

CREATE OR REPLACE FUNCTION notify_lineup_published()
RETURNS TRIGGER AS $$
DECLARE
  coach_name TEXT;
  display_name TEXT;
  event_title_val TEXT;
  user_ids UUID[];
  uid UUID;
  ref_type TEXT;
  ref_id TEXT;
BEGIN
  IF NEW.status = 'published' AND (OLD.status IS NULL OR OLD.status = 'draft') THEN
    -- Get coach name from profile (first staff on team, or fallback)
    SELECT p.full_name INTO coach_name
    FROM team_staff ts
    JOIN profiles p ON p.id = ts.user_id
    WHERE ts.team_id = NEW.team_id
    LIMIT 1;
    coach_name := COALESCE(coach_name, 'Coach');

    -- Get event title if linked
    IF NEW.event_id IS NOT NULL THEN
      SELECT title INTO event_title_val FROM cal_events WHERE id = NEW.event_id;
    END IF;
    display_name := COALESCE(event_title_val, NEW.name);

    -- Collect user_ids: players (with user_id) + parents (by email)
    user_ids := ARRAY(
      SELECT DISTINCT id FROM (
        SELECT user_id AS id FROM players
        WHERE team_id = NEW.team_id AND user_id IS NOT NULL
        UNION
        SELECT pr.id FROM players p
        JOIN profiles pr ON (pr.email = p.parent_email OR (p.secondary_parent_email IS NOT NULL AND pr.email = p.secondary_parent_email))
        WHERE p.team_id = NEW.team_id AND (p.parent_email IS NOT NULL OR p.secondary_parent_email IS NOT NULL)
      ) t
    );

    ref_type := CASE WHEN NEW.event_id IS NOT NULL THEN 'event' ELSE 'lineup_team' END;
    ref_id := COALESCE(NEW.event_id::TEXT, NEW.team_id::TEXT);

    -- Insert notif_history for each user
    FOREACH uid IN ARRAY user_ids
    LOOP
      IF uid IS NOT NULL THEN
        INSERT INTO notif_history (
          user_id,
          notification_type,
          title,
          body,
          reference_type,
          reference_id,
          is_read
        ) VALUES (
          uid,
          'lineup_published',
          'Lineup Published',
          coach_name || ' published the lineup for ' || display_name,
          ref_type,
          ref_id,
          false
        );
      END IF;
    END LOOP;

    -- Optional: Call send-push-notification Edge Function for push delivery.
    -- Requires pg_net extension: CREATE EXTENSION IF NOT EXISTS pg_net;
    -- Uncomment and adapt if you want push from web publishes:
    /*
    PERFORM net.http_post(
      url := 'https://<project-ref>.supabase.co/functions/v1/send-push-notification',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer <service-role-key>"}'::jsonb,
      body := json_build_object(
        'user_ids', user_ids,
        'title', 'Lineup Published',
        'body', coach_name || ' published the lineup for ' || display_name,
        'type', 'lineup_published',
        'data', json_build_object(
          'type', 'lineup_published',
          'lineupId', NEW.id,
          'eventId', NEW.event_id,
          'teamId', NEW.team_id,
          'reference_type', CASE WHEN NEW.event_id IS NOT NULL THEN 'event' ELSE 'lineup_team' END,
          'reference_id', COALESCE(NEW.event_id::TEXT, NEW.team_id::TEXT)
        )
      )::jsonb
    );
    */
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if present
DROP TRIGGER IF EXISTS on_lineup_published ON lineup_formations;

CREATE TRIGGER on_lineup_published
  AFTER UPDATE ON lineup_formations
  FOR EACH ROW
  WHEN (
    NEW.status = 'published'
    AND (OLD.status IS NULL OR OLD.status = 'draft')
  )
  EXECUTE FUNCTION notify_lineup_published();
