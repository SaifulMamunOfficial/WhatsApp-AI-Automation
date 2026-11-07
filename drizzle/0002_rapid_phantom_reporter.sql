CREATE TYPE "public"."automation_kind" AS ENUM('welcome', 'keyword', 'office_hours');--> statement-breakpoint
CREATE TYPE "public"."template_status" AS ENUM('draft', 'pending', 'approved', 'rejected', 'paused');--> statement-breakpoint
CREATE TYPE "public"."channel_status" AS ENUM('pending', 'active', 'disconnected');--> statement-breakpoint
CREATE TYPE "public"."channel_type" AS ENUM('whatsapp', 'messenger');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."message_source" AS ENUM('api', 'phone_app', 'page_inbox', 'history');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('pending', 'sent', 'delivered', 'read', 'failed');--> statement-breakpoint
CREATE TABLE "automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "automation_kind" NOT NULL,
	"name" text NOT NULL,
	"channel_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_base" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"name" text NOT NULL,
	"language" text NOT NULL,
	"category" text NOT NULL,
	"status" "template_status" DEFAULT 'draft' NOT NULL,
	"meta_template_id" text,
	"components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "templates_channel_name_language_unique" UNIQUE("channel_id","name","language")
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "channel_type" NOT NULL,
	"name" text NOT NULL,
	"external_id" text NOT NULL,
	"waba_id" text,
	"display_phone" text,
	"access_token_encrypted" text,
	"status" "channel_status" DEFAULT 'pending' NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"bot_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channels_type_external_id_unique" UNIQUE("type","external_id")
);
--> statement-breakpoint
CREATE TABLE "contact_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_identities_channel_external_unique" UNIQUE("channel_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "contact_tags" (
	"contact_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_tags_contact_id_tag_id_pk" PRIMARY KEY("contact_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "conversation_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"identity_id" uuid NOT NULL,
	"status" "conversation_status" DEFAULT 'open' NOT NULL,
	"assigned_user_id" uuid,
	"bot_paused" boolean DEFAULT false NOT NULL,
	"last_customer_message_at" timestamp with time zone,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_preview" text,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_channel_identity_unique" UNIQUE("channel_id","identity_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"external_id" text,
	"direction" "message_direction" NOT NULL,
	"source" "message_source" NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"body" text,
	"status" "message_status" DEFAULT 'sent' NOT NULL,
	"error" text,
	"sent_by_user_id" uuid,
	"sent_by_bot" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_identity_id_contact_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."contact_identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sent_by_user_id_users_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automations_kind_idx" ON "automations" USING btree ("kind","enabled");--> statement-breakpoint
CREATE INDEX "contact_identities_contact_idx" ON "contact_identities" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "conversation_notes_conversation_idx" ON "conversation_notes" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversations_last_message_idx" ON "conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_assigned_idx" ON "conversations" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_sent_idx" ON "messages" USING btree ("conversation_id","sent_at");