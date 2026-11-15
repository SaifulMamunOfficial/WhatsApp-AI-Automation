CREATE TABLE "lifecycle_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color_key" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "stage_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "last_outbound_message_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "lifecycle_stages_default_idx" ON "lifecycle_stages" USING btree ("is_default") WHERE is_default = true;--> statement-breakpoint
CREATE INDEX "lifecycle_stages_sort_order_idx" ON "lifecycle_stages" USING btree ("sort_order");--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_stage_id_lifecycle_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."lifecycle_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_stage_idx" ON "contacts" USING btree ("stage_id");--> statement-breakpoint
INSERT INTO "lifecycle_stages" ("name", "color_key", "sort_order", "is_default") VALUES
  ('New Lead', 'blue', 0, true),
  ('Qualified', 'sky', 1, false),
  ('Interested', 'amber', 2, false),
  ('Payment Pending', 'orange', 3, false),
  ('Customer', 'emerald', 4, false),
  ('No Response', 'slate', 5, false),
  ('Lost', 'rose', 6, false);--> statement-breakpoint
UPDATE "contacts" SET "stage_id" = (SELECT "id" FROM "lifecycle_stages" WHERE "is_default" = true LIMIT 1) WHERE "stage_id" IS NULL;--> statement-breakpoint
UPDATE "conversations" c SET "last_outbound_message_at" = (
  SELECT MAX("created_at") FROM "messages" m WHERE m."conversation_id" = c."id" AND m."direction" = 'outbound'
);
