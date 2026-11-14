CREATE TYPE "public"."media_status" AS ENUM('pending', 'downloading', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "message_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"ref_kind" text NOT NULL,
	"ref" text NOT NULL,
	"mime_type" text,
	"file_name" text,
	"status" "media_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"storage_key" text,
	"size_bytes" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_media_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
ALTER TABLE "message_media" ADD CONSTRAINT "message_media_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;