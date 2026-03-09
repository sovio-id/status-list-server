CREATE TABLE `status_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`status_list` text NOT NULL,
	`assigned_indexes` text,
	`created_at` integer DEFAULT '"2026-03-09T08:39:35.571Z"' NOT NULL,
	`updated_at` integer DEFAULT '"2026-03-09T08:39:35.571Z"' NOT NULL
);
