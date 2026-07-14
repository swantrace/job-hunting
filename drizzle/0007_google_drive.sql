CREATE TABLE `google_drive_connections` (
  `id` integer PRIMARY KEY NOT NULL,
  `refresh_token_encrypted` text NOT NULL,
  `folder_id` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `google_drive_connections_singleton_check` CHECK(`id` = 1)
);
