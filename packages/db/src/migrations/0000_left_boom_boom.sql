CREATE TABLE IF NOT EXISTS `status_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`status_list` text NOT NULL,
	`created_at` integer DEFAULT '"2026-03-13T06:41:42.596Z"' NOT NULL,
	`updated_at` integer DEFAULT '"2026-03-13T06:41:42.596Z"' NOT NULL
);
