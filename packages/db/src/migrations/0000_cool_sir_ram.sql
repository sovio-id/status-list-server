CREATE TABLE "status_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"status_list" text NOT NULL,
	"format" text DEFAULT 'token' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
