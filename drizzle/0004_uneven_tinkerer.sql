ALTER TYPE "public"."automation_kind" ADD VALUE 'ai';--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "needs_human" boolean DEFAULT false NOT NULL;