PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_status_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`status_list` text NOT NULL,
	`format` text DEFAULT 'token' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_status_lists`("id", "status_list", "format", "created_at", "updated_at") SELECT "id", "status_list", "format", "created_at", "updated_at" FROM `status_lists`;--> statement-breakpoint
DROP TABLE `status_lists`;--> statement-breakpoint
ALTER TABLE `__new_status_lists` RENAME TO `status_lists`;--> statement-breakpoint
PRAGMA foreign_keys=ON;