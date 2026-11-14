CREATE TABLE "ai_provider_settings" (
	"provider" text PRIMARY KEY NOT NULL,
	"api_key_encrypted" text,
	"model" text,
	"active" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
