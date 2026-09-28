-- Pending multi-step input for onboarding/settings (custom TZ, DND wizard)

ALTER TABLE users ADD COLUMN pending_action TEXT;
