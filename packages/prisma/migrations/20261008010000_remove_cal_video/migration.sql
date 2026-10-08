-- Remove only the retired provider from configuration; existing booking records and links are preserved.
UPDATE "App" SET "enabled" = false WHERE "slug" = 'daily-video';
UPDATE "users" SET "metadata" = "metadata" - 'defaultConferencingApp'
WHERE "metadata"->'defaultConferencingApp'->>'appSlug' = 'daily-video';
UPDATE "EventType" AS event SET "locations" = (
  SELECT COALESCE(jsonb_agg(location ORDER BY position), '[]'::jsonb)
  FROM jsonb_array_elements(event."locations") WITH ORDINALITY AS entry(location, position)
  WHERE location->>'type' IS DISTINCT FROM 'integrations:daily'
)
WHERE jsonb_typeof("locations") = 'array'
AND "locations" @> '[{"type":"integrations:daily"}]'::jsonb;
DELETE FROM "HostLocation" WHERE "type" = 'integrations:daily';
UPDATE "EventType" SET "canSendCalVideoTranscriptionEmails" = false
WHERE "canSendCalVideoTranscriptionEmails" = true;

ALTER TABLE "EventType" ALTER COLUMN "canSendCalVideoTranscriptionEmails" SET DEFAULT false;
