-- Direction is now defined solely by preferences.directionDefinitions; the
-- profile-selection concept is removed. Drop the profile columns so the schema
-- stays clean.
ALTER TABLE `application_analysis_runs` DROP COLUMN `recommended_profile_id`;
--> statement-breakpoint
ALTER TABLE `application_analysis_runs` DROP COLUMN `confirmed_profile_id`;
--> statement-breakpoint
ALTER TABLE `application_analysis_runs` DROP COLUMN `profile_confirmed_at`;
