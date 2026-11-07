# Saimum CRM — Claude Code-এর জন্য প্রজেক্ট নির্দেশিকা

এই ফাইল Claude Code প্রতিটা সেশনের শুরুতে পড়ে। প্রজেক্টের সব মূল সিদ্ধান্ত আর নিয়ম এখানে আছে।
বিস্তারিত পরিকল্পনা: `docs/PLAN.md`। Meta API-র খুঁটিনাটি: `docs/META_NOTES.md`।

## ব্যবহারকারী ও যোগাযোগ

- মালিক: Saiful (Saimum Shilpigosthi, ঢাকা, বাংলাদেশ)। সময় অঞ্চল: Asia/Dhaka।
- **ব্যবহারকারীকে সবসময় বাংলা হরফে উত্তর দেবে** (Banglish নয়)। কোড, কমেন্ট, কমিট মেসেজ, ভেরিয়েবলের নাম ইংরেজিতে।
- বড় বা ফেরত-আনা-কঠিন কাজের আগে (ডাটাবেস মুছে ফেলা, আসল নম্বর/পেজ যুক্ত করা, production deploy) জিজ্ঞেস করবে।

## প্রজেক্ট কী

প্রতিষ্ঠানের নিজস্ব CRM সাইট। একটাই inbox থেকে দুই চ্যানেলের মেসেজের উত্তর:
1. **WhatsApp Business** — প্রতিষ্ঠানের বিদ্যমান WhatsApp Business App নম্বর, Meta-র **Coexistence** দিয়ে। নম্বর বদলাবে না, অ্যাপ থাকবে, কন্টাক্ট ও গ্রুপ অক্ষত থাকবে।
2. **Facebook Messenger** — প্রতিষ্ঠানের Facebook Page-গুলোর inbox (Saimum Shilpigosthi, Saimum KIDS ইত্যাদি)।

### প্রথম ভার্সনের (MVP) ফিচার — দুই চ্যানেলের জন্যই
- একটাই Inbox + WhatsApp Coexistence সিঙ্ক (echo, history, contacts)
- Keyword মেনু, স্বাগত মেসেজ, অফিস সময়ের বাইরে auto-reply (অফিস সময়: সকাল ১০টা–রাত ১০টা)
- Knowledge base থেকে বাংলায় উত্তর দেওয়া AI bot, না পারলে মানুষের হাতে হ্যান্ডঅফ
- কন্টাক্ট ট্যাগ + template broadcast (broadcast শুধু WhatsApp-এ)

## অবশ্য-পালনীয় নিয়ম

- **সব কোড শূন্য থেকে লেখা।** কোনো ওপেন-সোর্স CRM (যেমন wacrm) থেকে কোড কপি বা fork করা যাবে না, কোনো সংযোগও থাকবে না। লাইব্রেরি (npm প্যাকেজ) ব্যবহার করা যাবে।
- **আসল WhatsApp নম্বর বা আসল পেজ ডেভেলপমেন্টে যুক্ত করবে না।** ডেভেলপমেন্ট শুধু Meta-র টেস্ট নম্বর আর একটা টেস্ট পেজ দিয়ে।
- **আসল নম্বর কখনো Meta App-এর সাধারণ "Add phone number" বা `/register` দিয়ে যুক্ত করা যাবে না** — তাতে নম্বর Business App থেকে সরে যায়। শুধু Coexistence Embedded Signup।
- গোপন মান (টোকেন, App Secret, এনক্রিপশন key, DB পাসওয়ার্ড) শুধু `.env`-এ; কখনো git-এ নয়। ডাটাবেসে টোকেন AES-256-GCM দিয়ে এনক্রিপ্ট করে রাখবে।
- প্রতিটা webhook request-এ `X-Hub-Signature-256` (App Secret দিয়ে HMAC-SHA256) যাচাই করবে।
- Webhook দ্রুত 200 ফেরত দেবে; ভারী কাজ (AI উত্তর, history import) আলাদা job-এ।
- একই মেসেজ দুবার এলে (একই `wamid` / Messenger `mid`) বাদ দেবে — idempotent।

## টেক স্ট্যাক

- Next.js (App Router, TypeScript), Tailwind CSS
- PostgreSQL (লোকালে Docker, production-এ VPS-এ Docker Compose)
- ORM: **Drizzle** (`drizzle-orm` + `pg` + `drizzle-kit`; স্কিমা `src/db/schema.ts`, migration `drizzle/`)
- Background jobs: Postgres-ভিত্তিক queue (যেমন pg-boss) — আলাদা Redis এড়াতে
- Real-time inbox: Server-Sent Events বা WebSocket
- AI: OpenAI বা Anthropic API (env দিয়ে বাছাই)
- Hosting: Hostinger VPS (KVM 4, Ubuntu 24.04), ডোমেইন `crm.saimum.org`, HTTPS-এর জন্য Caddy বা Nginx
- লোকাল টেস্টে webhook-এর জন্য `cloudflared tunnel --url http://localhost:3000`

## Auth (ধাপ ২-এ সিদ্ধান্ত)

- নিজস্ব DB-ভিত্তিক session: cookie `session`-এ র‍্যান্ডম token (httpOnly, sameSite=lax, production-এ secure), `sessions` টেবিলে শুধু SHA-256 হ্যাশ। মেয়াদ ১৪ দিন, sliding।
- পাসওয়ার্ড: Node `crypto.scrypt` (N=2^17), ন্যূনতম ১০ অক্ষর। সাইন-আপ পেজ নেই; ইউজার বানাতে `npx tsx scripts/create-user.ts --email … --name "…" --role admin|agent` (পাসওয়ার্ড `CRM_USER_PASSWORD` env থেকে, না দিলে র‍্যান্ডম তৈরি হয়)।
- `src/proxy.ts` (Next 16-এ middleware-এর নতুন নাম) শুধু cookie আছে কি না দেখে; আসল যাচাই `requireUser()` / `requireRole()` (`src/core/auth/dal.ts`)। প্রতিটা Server Action ও API route-এ নিজে role চেক করবে।
- `cacheComponents` চালু: session পড়া কম্পোনেন্ট অবশ্যই `<Suspense>`-এর ভেতরে।
- `/api/webhooks/*` proxy-র বাইরে (সই দিয়ে যাচাই হবে)।
- লগইনে ব্যর্থ চেষ্টার সীমা (ইমেইল+IP প্রতি ১৫ মিনিটে ৫ বার), in-memory; একাধিক instance চালালে DB-তে সরাতে হবে।

## আর্কিটেকচার — চ্যানেল-নিরপেক্ষ

Inbox, bot আর automation জানবে না মেসেজ কোন চ্যানেলের। চ্যানেলের সব নিয়ম শুধু adapter-এ।

```
src/
  channels/
    types.ts            # NormalizedMessage, ChannelAdapter interface
    whatsapp/           # webhook parser, sender, coexistence, echo/history sync
    messenger/          # webhook parser, sender (HUMAN_AGENT tag), page connect
  core/
    inbox/              # conversations, assignment, notes
    automation/         # welcome, keyword menu, office hours, bot pause on human reply
    ai/                 # knowledge base retrieval, answer, handoff
    contacts/           # contacts, identities, tags, merge
    broadcast/          # WhatsApp templates + broadcast
  app/api/webhooks/whatsapp/route.ts
  app/api/webhooks/messenger/route.ts
```

### ডাটাবেসের মূল টেবিল
- `channels` — প্রতিটা WhatsApp নম্বর ও প্রতিটা Facebook Page এক সারি (type, external ids, encrypted token, status)
- `contacts` + `contact_identities` — একজন মানুষ; WhatsApp নম্বর ও Facebook PSID আলাদা identity সারিতে
- `conversations`, `messages` — প্রতিটায় `channel_id`; messages-এ `source` (api / phone_app / page_inbox / history), `external_id` unique
- `users` (roles: admin, agent), `tags`, `contact_tags`, `templates`, `automations`, `knowledge_base`, `jobs`

## চ্যানেলের নিয়ম (সংক্ষেপে — বিস্তারিত docs/META_NOTES.md)

| বিষয় | WhatsApp | Messenger |
| --- | --- | --- |
| Bot উত্তর দিতে পারবে | শেষ গ্রাহক-মেসেজের ২৪ ঘণ্টার মধ্যে | ২৪ ঘণ্টার মধ্যে |
| ২৪ ঘণ্টার পরে | শুধু অনুমোদিত template | শুধু মানুষ, `HUMAN_AGENT` tag দিয়ে ৭ দিন পর্যন্ত |
| মানুষ ফোন/পেজ ইনবক্স থেকে উত্তর দিলে | `smb_message_echoes` আসে → bot থামাও | `message_echoes` আসে → bot থামাও |
| গ্রুপ | API-তে নেই, শুধু ফোনে | — |
| Broadcast | template দিয়ে | MVP-তে নেই |

## কাজের ক্রম (বর্তমান অবস্থা অনুযায়ী হালনাগাদ রাখো)

1. [x] প্রজেক্টের কাঠামো: Next.js + Tailwind, Docker-এ Postgres, ORM, migration (Docker Postgres 16-এ `db:migrate` চালিয়ে যাচাই করা, ২০২৬-১১-০৭)
2. [x] লগইন ও রোল (admin, agent) (আসল Docker Postgres-এ ব্রাউজারে লগইন যাচাই করা)
3. [x] চ্যানেল-ভিত্তিক ডাটাবেস স্কিমা (`src/db/schema/*`, migration `0000`–`0002` আসল Postgres-এ প্রয়োগ, ১৪টি টেবিল। `jobs` টেবিল pg-boss নিজে বানাবে, তাই এখানে নেই)
4. [x] Channel adapter interface + WhatsApp webhook/sender (কোড ও টেস্ট সম্পূর্ণ; Meta-র আসল টেস্ট নম্বরে end-to-end পরীক্ষা বাকি, কারণ Meta App ও cloudflared এখনো তৈরি নয়)
5. [x] Messenger webhook/sender (টেস্ট পেজ) (কোড ও টেস্ট সম্পূর্ণ; আসল টেস্ট পেজে end-to-end বাকি)
6. [x] Inbox UI (real-time, assign, notes, channel filter) (ব্রাউজারে আসল ডাটাবেসে যাচাই করা; আসল Meta টেস্ট নম্বরে end-to-end বাকি। WhatsApp-এ ২৪ ঘণ্টার পরে template পাঠানো ধাপ ১২-তে)
7. [ ] WhatsApp Coexistence: Embedded Signup + echo + history + contact sync
8. [ ] Facebook Page সংযোগ (Facebook Login → page token → subscribe)
9. [ ] Automation ইঞ্জিন (welcome, keyword menu, office hours, human-reply pause)
10. [ ] AI bot + knowledge base
11. [ ] কন্টাক্ট, ট্যাগ, merge, CSV import
12. [ ] WhatsApp templates + broadcast
13. [ ] VPS deploy (Docker Compose, Caddy, backups), পূর্ণ পরীক্ষা
14. [ ] আসল নম্বর ও পেজ যুক্ত করা — bot বন্ধ রেখে (ব্যবহারকারীর অনুমতি নিয়ে)

প্রতিটা ধাপ শেষে এই তালিকায় টিক দাও আর `docs/PLAN.md`-এর অবস্থা হালনাগাদ করো।

## যা আগে থেকেই প্রস্তুত (২০২৬-১১-০৭)

- Meta Business Portfolio: Saimum Shilpigosthi — Business verification সম্পন্ন (৩১ অক্টোবর ২০২৩)
- Facebook Page Portfolio-তে যুক্ত (Primary Page-এ "Review needed" বাকি)
- Hostinger VPS চালু; ডোমেইন saimum.org আছে
- বাকি: Portfolio-র ১ জনের 2FA, Meta App তৈরি, App Review, `crm.saimum.org` DNS

## টেস্ট

- Webhook parser, signature যাচাই, adapter আর automation নিয়মের জন্য unit test বাধ্যতামূলক (Vitest)।
- Meta-র আসল webhook payload-এর নমুনা `tests/fixtures/`-এ রাখো (এখন `tests/fixtures/whatsapp/` — Meta ডক থেকে নেওয়া)।
- DB-সংক্রান্ত টেস্ট `tests/helpers/test-db.ts`-এর PGlite (in-process Postgres) দিয়ে চলে; Docker লাগে না, আর `drizzle/` migration-গুলোও প্রতিবার চালিয়ে যাচাই হয়।

## Webhook ও ingest (ধাপ ৪-এ সিদ্ধান্ত)

- Route পাতলা: `src/app/api/webhooks/<channel>/route.ts` → `src/channels/webhook-handler.ts` (GET verify + POST: raw body-তে signature, parse, ingest, দ্রুত 200)।
- `ingest` (`src/core/inbox/ingest.ts`) চ্যানেল-নিরপেক্ষ ও idempotent: `messages.external_id` unique; ব্যর্থ হলে 500 দেয় যাতে Meta আবার পাঠায়। ভারী কাজ (AI, history import) এখানে নয়, job-এ যাবে।
- Phone-app echo (`smb_message_echoes`) → outbound/`phone_app` মেসেজ হিসেবে সেভ হয় এবং `conversations.bot_paused = true` করে।
- Status শুধু সামনের দিকে যায় (sent → delivered → read); `failed` শুধু পৌঁছানোর আগে।
- WhatsApp contact-এর পরিচয়: ফোন নম্বর (`from`); নম্বর লুকানো থাকলে BSUID (`from_user_id`)।
- **Messenger echo**: `message_echoes`-এ `app_id` দেখে সূত্র ঠিক হয় (`src/channels/messenger/parser.ts`)। `app_id == META_APP_ID` মানে আমাদের নিজের API-র মেসেজ → `source=api`, bot থামে না। Page inbox (`26390203743090`) বা অন্য কোনো অ্যাপ → `page_inbox`, bot থামে। `META_APP_ID` না থাকলে নিরাপদ ডিফল্ট: সবই "মানুষের উত্তর" ধরে bot থামে। ধাপ ৬-এ উত্তর পাঠানোর কোড মেসেজ সেভ করার সময় `external_id` conflict সামলাবে, কারণ echo আমাদের নিজের সেভের আগে আসতে পারে।
- **Messenger sender**: Page token `Authorization` header-এ (URL-এ নয়)। ২৪ ঘণ্টার মধ্যে `RESPONSE`; `humanAgent: true` হলে `MESSAGE_TAG` + `HUMAN_AGENT` (৭ দিন)। Bot কখনো `humanAgent` দেবে না, সেটা ওপরের স্তরে (ধাপ ৬/৯) বাধ্যতামূলক করতে হবে।
- Messenger-এ delivery/read receipt সাবস্ক্রাইব করা নেই (read watermark-ভিত্তিক, মেসেজ-ভিত্তিক নয়)। কাস্টমারের নাম webhook-এ আসে না; পরে Graph API দিয়ে এনে `contact_identities.display_name`-এ বসাতে হবে (ধাপ ৮-এর কাছাকাছি)।
## Inbox (ধাপ ৬-এ সিদ্ধান্ত)

- একটাই পেজ `/inbox` (`src/app/(app)/inbox/`): বাঁয়ে তালিকা, ডানে কথোপকথন। ফিল্টার URL-এ (`?channel=&assigned=&status=&q=&c=<id>`), সব সার্ভার কম্পোনেন্ট; ক্লায়েন্ট কোড শুধু ফর্ম, `Realtime`, `MarkRead`, `ScrollToBottom`।
- **উত্তর পাঠানো** `src/core/inbox/send.ts` (`sendReply`): চ্যানেল-অনুযায়ী ২৪ ঘণ্টার নিয়ম `window.ts`-এ (WhatsApp: ২৪ঘ পরে template লাগে; Messenger: মানুষ ৭ দিন পর্যন্ত `HUMAN_AGENT`, **bot কখনো নয়**)। আগে `pending` সারি, পরে provider-এ পাঠানো; ব্যর্থ হলে `failed` + কারণ। echo আগে এলে সেই সারির সাথে মিশে যায়। মানুষ উত্তর দিলে `bot_paused = true`।
- **Real-time**: `src/core/inbox/events.ts` in-process event bus → SSE `/api/inbox/stream` → ক্লায়েন্টে `router.refresh()`। শুধু conversation id যায়, ডেটা নয়। একটাই Node process ধরে নেওয়া; একাধিক instance হলে Postgres LISTEN/NOTIFY-তে সরাতে হবে (একই interface)।
- **অনুমতি**: প্রতিটা Server Action `requireUser()` ও zod দিয়ে ইনপুট যাচাই করে। Admin যে কাউকে assign করতে পারে; agent শুধু নিজের জন্য নিতে বা নিজেরটা ছেড়ে দিতে পারে (`mutations.ts`, টেস্ট করা)।
- **Cache Components-এর শিক্ষা**: সময়-নির্ভর কোড (`new Date()`) request-time-এ চালাতে `await connection()` লাগে (`getCurrentUser`-এ দেওয়া আছে); না দিলে dev-এ validation ত্রুটি আসে এবং Suspense-এর ভেতরের অংশ (যেমন `MarkRead`) কখনো কখনো কাজ করে না। React 19 `<form action>` শেষে ফর্ম রিসেট করে, তাই সার্ভারের মানে বদলানো uncontrolled ইনপুটে `key` দিতে হয়।
- **Browser pane লুকানো থাকলে** Suspense-এর reveal (`requestAnimationFrame`) আটকে যায়: পেজ "লোড হচ্ছে…"-তে থেকে যেতে পারে। এটা অ্যাপের ত্রুটি নয়; পরীক্ষার সময় pane দৃশ্যমান রাখো।

## Docker ছাড়া ডেভ ডাটাবেস

- `npm run dev:db` PGlite (আসল Postgres, WASM) চালায় `.env`-এর `DATABASE_URL`-এর পোর্টে (ওভাররাইড: `DEV_DB_PORT`); ডেটা `.pglite/`-এ (git-এ যায় না)। প্রথমবার `npm run db:seed-dev` ও `scripts/create-user.ts` দরকার।
- **এই মেশিনে (Saiful-এর) একটা নিজস্ব Postgres 5432 পোর্টে চলে** (Windows service, `crm` রোল নেই), তাই `.env`-এ `POSTGRES_PORT=5433` ও `DATABASE_URL`-এ `:5433` রাখা আছে; Docker ও `dev:db` দুটোই 5433 ব্যবহার করে। ওই Postgres-এ হাত দেওয়া যাবে না। `role "crm" does not exist` ত্রুটি মানে অ্যাপ ভুল Postgres-এ (5432) যাচ্ছে।
- **Docker এখন কাজ করছে** (২০২৬-১১-০৭): container `saimum-crm-db-1` (postgres:16-alpine) `127.0.0.1:5433`-এ। `docker` কমান্ড PATH-এ না থাকলে পুরো পাথ: `C:\Users\User\AppData\Local\Programs\DockerDesktop\resources\bin`। Docker Desktop-এর ডিস্ক ইমেজ C: ড্রাইভে থাকে; **C: পূর্ণ হলে** Docker "unable to start" বলে ও image pull `input/output error` দেয় (এটাই আগে ঘটেছিল)। তখন C: খালি করো বা Docker Settings → Resources → Disk image location E: ড্রাইভে সরাও। Docker না চললে `dev:db` ব্যবহার করা যায়।
- ডেভ লগইন (শুধু লোকাল, আসল ইউজার নয়): `admin@dev.local` ও `agent@dev.local`, পাসওয়ার্ড `dev-pass-12345` (`scripts/create-user.ts` দিয়ে বসানো)। আসল admin বানিয়ে এগুলো মুছে ফেলো।
- `npm run db:seed-dev` দুই টেস্ট চ্যানেল ও নমুনা কথোপকথন বসায় (আসল চ্যানেল থাকলে অস্বীকার করে)। Token নকল, তাই উত্তর পাঠালে Meta `Invalid OAuth access token` দেবে।
- শুধু ডেভেলপমেন্টের জন্য; production-এ Docker Compose-এর আসল PostgreSQL।

- `src/db/index.ts` `DATABASE_URL` না থাকলেও import-এ throw করে না (Docker image build-এর জন্য)।
