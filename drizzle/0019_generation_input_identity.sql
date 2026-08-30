ALTER TABLE `generation_runs` ADD `input_hash` text;
--> statement-breakpoint
ALTER TABLE `generation_runs` ADD `frozen_input_json` text;
--> statement-breakpoint
ALTER TABLE `generation_runs` ADD `resume_model` text;
--> statement-breakpoint
ALTER TABLE `generation_runs` ADD `cover_letter_model` text;
--> statement-breakpoint
ALTER TABLE `generation_runs` ADD `prompt_version` text;
--> statement-breakpoint
ALTER TABLE `generation_runs` ADD `schema_version` text;
