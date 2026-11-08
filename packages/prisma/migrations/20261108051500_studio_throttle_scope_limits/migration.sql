ALTER TABLE "StudioAuthThrottle"
  DROP CONSTRAINT "StudioAuthThrottle_attempts_check",
  ADD CONSTRAINT "StudioAuthThrottle_attempts_check" CHECK ("attempts" >= 1);
