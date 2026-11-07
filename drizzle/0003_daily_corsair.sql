CREATE TYPE "public"."history_sync_status" AS ENUM('not_requested', 'requested', 'in_progress', 'complete', 'declined', 'failed');--> statement-breakpoint
CREATE TABLE "whatsapp_sync_state" (
	"channel_id" uuid PRIMARY KEY NOT NULL,
	"onboarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"contacts_requested_at" timestamp with time zone,
	"contacts_request_id" text,
	"history_requested_at" timestamp with time zone,
	"history_request_id" text,
	"history_status" "history_sync_status" DEFAULT 'not_requested' NOT NULL,
	"history_progress" integer DEFAULT 0 NOT NULL,
	"history_message_count" integer DEFAULT 0 NOT NULL,
	"contacts_synced_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_sync_state" ADD CONSTRAINT "whatsapp_sync_state_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;