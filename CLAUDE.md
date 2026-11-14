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
7. [x] WhatsApp Coexistence: Embedded Signup + echo + history + contact sync (কোড, টেস্ট ও সই-করা webhook দিয়ে Docker Postgres-এ যাচাই সম্পূর্ণ; আসল Meta App/নম্বরে Embedded Signup বাকি, `ALLOW_REAL_CHANNEL_CONNECT=false` দিয়ে বন্ধ রাখা। `/register` কোথাও নেই। history/contact sync Meta ডক থেকে বানানো fixture-এ পরীক্ষিত, আসল payload ধরা বাকি)
8. [x] Facebook Page সংযোগ (Facebook Login → page token → subscribe) (কোড, টেস্ট ও অ্যাডমিন UI সম্পূর্ণ; আসল Meta App/টেস্ট পেজে Facebook Login পরীক্ষা বাকি। Page token সার্ভারে এনক্রিপ্ট করে রাখা, ব্রাউজারে যায় না; আসল পেজ `ALLOW_REAL_CHANNEL_CONNECT` ছাড়া যুক্ত হয় না, "টেস্ট পেজ" টিক থাকলে হয়। Page token-এর মেয়াদ না-থাকা Meta ডকে যাচাই করিনি; `/me/accounts` ও token exchange আমার জানা Graph আচরণ অনুযায়ী লেখা)
9. [x] Automation ইঞ্জিন (welcome, keyword menu, office hours, human-reply pause) (আসল Docker Postgres-এ সই-করা webhook দিয়ে end-to-end যাচাই; আসল Meta-তে পাঠানো বাকি। Job queue (pg-boss) ধাপ ১০-এ; এখন webhook-এর 200-এর পরে `after()` দিয়ে চলে)
10. [x] AI bot + knowledge base (কাঠামো, নকল-provider টেস্ট, অ্যাডমিন পেজ ও আসল Postgres-এ UI যাচাই সম্পূর্ণ; **আসল AI API key দিয়ে কোনো উত্তর এখনো যাচাই হয়নি**, কারণ key নেই। pg-boss queue এখনো যোগ হয়নি, `after()`-ই আছে)
11. [x] কন্টাক্ট, ট্যাগ, merge, CSV import (আসল Docker Postgres-এ যাচাই; CSV ফাইল-আপলোড ফর্ম ব্রাউজারে চালানো হয়নি, শুধু সার্ভিস-টেস্ট)
12. [x] WhatsApp templates + broadcast (সুরক্ষা-নিয়মসহ কোড, টেস্ট ও আসল Postgres-এ চালানো; **আসল Meta-তে template জমা/অনুমোদন/পাঠানো একবারও হয়নি**; নিচের "অযাচাইকৃত" তালিকা দেখো)
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

## Automation (ধাপ ৯-এ সিদ্ধান্ত)

- `src/core/automation/`: `engine.ts` (বিশুদ্ধ সিদ্ধান্ত, DB/নেটওয়ার্ক নেই), `run.ts` (DB থেকে তথ্য → সিদ্ধান্ত → `sendReply(sender:"bot")`), `admin.ts`/`actions.ts` (অ্যাডমিন-only), পেজ `/settings/automations`।
- **নিয়ম**: bot চলে না যদি চ্যানেলের `bot_enabled` বন্ধ, বা কথোপকথনে `bot_paused` (মানুষ উত্তর দিয়েছে), বা মেসেজ live-inbound নয় (history/echo/নিজের মেসেজ)। **প্রতি মেসেজে সর্বোচ্চ একটি উত্তর**; অগ্রাধিকার: keyword > অফিস-সময়ের-বাইরে নোটিস > স্বাগত। অফিস সময় `.env`-এর `OFFICE_TZ/OPEN/CLOSE` (ডিফল্ট ১০:০০–২২:০০ Asia/Dhaka); নোটিস ১২ ঘণ্টায় একবার। স্বাগত: প্রথম মেসেজে, বা ৭২ ঘণ্টা চুপ থাকার পর; আগে থেকে ইতিহাস (history import) থাকা গ্রাহক "নতুন" নয়।
- Keyword মিল: ছোট হাতের, বাংলা সংখ্যা → ইংরেজি (১ = 1), যতিচিহ্ন বাদ, **পুরো শব্দ** (`1` ≠ `150`)। শুধু টেক্সট; ছবি/অডিওতে keyword নয়, কিন্তু স্বাগত/অফিস নোটিস যেতে পারে। মেনু = `menu, মেনু` keyword-এর একটা নিয়ম।
- ট্রিগার: `ingestEvents` শুধু **নতুন সেভ হওয়া** live customer মেসেজ `newInbound`-এ দেয় (redelivery দেয় না ⇒ দ্বিতীয় উত্তর নেই); webhook route `scheduleAutomations()` (`after()`) ডাকে। bot-এর ব্যর্থতা লগ হয়, কখনো webhook বা অন্য কিছু ভাঙে না। `after()` ক্র্যাশে হারিয়ে গেলে retry নেই; ধাপ ১০-এ টেকসই queue আসবে।
- নতুন আসল চ্যানেল **bot বন্ধ** অবস্থায় শুরু (go-live: প্রথম ১–২ সপ্তাহ বন্ধ, পরে অফিস সময়ের বাইরে, তারপর ২৪ ঘণ্টা)। এখন "শুধু অফিস সময়ের বাইরে" মোড আলাদা নেই; সেটা go-live-এর আগে যোগ করা দরকার।

## AI bot ও জ্ঞানভান্ডার (ধাপ ১০-এ সিদ্ধান্ত)

- `src/core/ai/`: `retrieve.ts` (জ্ঞানভান্ডার থেকে প্রাসঙ্গিক লেখা: শব্দ-স্তরের অক্ষর-trigram, বাংলা suffix সামলায়; ছোট ভান্ডার পুরোটাই যায়), `providers.ts` (Anthropic ও OpenAI, plain fetch, SDK নয়; মডেল `AI_MODEL`, ডিফল্ট `claude-haiku-5-5` / `gpt-4o-mini` — **ডিফল্ট মডেলের নাম আসল API-তে যাচাই করা হয়নি**), `answer.ts` (prompt + JSON উত্তর পার্স)।
- **নিয়ম**: AI শুধু জ্ঞানভান্ডার থেকে উত্তর দেয়। উত্তর `{"answer","handoff","reason"}` JSON; অবৈধ/খালি/বড়/ভাঙা উত্তর **সবসময় handoff**, কখনো আন্দাজি বার্তা নয়। জ্ঞানভান্ডার খালি হলে মডেল ডাকাই হয় না। গ্রাহকের মেসেজের ভেতরের নির্দেশ মানতে নিষেধ করা আছে (prompt injection)।
- **অগ্রাধিকার**: keyword > AI > অফিস-নোটিস > স্বাগত। AI শুধু text মেসেজে, প্রতি মেসেজে একটাই উত্তর, আর provider (`ANTHROPIC_API_KEY`/`OPENAI_API_KEY`) + অন্তত একটা চালু লেখা + অ্যাডমিন সুইচ (kind `ai` automation row) তিনটাই লাগে; না থাকলে বাকি bot আগের মতো চলে।
- **Handoff**: কথোপকথনে `needs_human = true` + `bot_paused = true` + status open; গ্রাহককে হ্যান্ডঅফ বার্তা (এডিটযোগ্য) যায়; ইনবক্সে লাল "মানুষ দরকার" ব্যাজ ও ফিল্টার। মানুষ উত্তর দিলে (CRM/ফোন/পেজ ইনবক্স) বা কথোপকথন বন্ধ করলে চিহ্ন সরে। Provider ব্যর্থ হলে: `needs_human = true` (bot থামে না), আর সাধারণ নিয়ম (স্বাগত/অফিস-নোটিস) ফলব্যাক।
- **সুরক্ষা**: কথোপকথনে ঘণ্টায় সর্বোচ্চ N AI উত্তর (ডিফল্ট ৬), বেশি হলে handoff। AI-র উত্তর `sendReply(sender:"bot")` দিয়ে যায়, তাই ২৪ ঘণ্টার নিয়ম ও `HUMAN_AGENT` নিষেধ বহাল। Provider ত্রুটিতে API key/অনুরোধ লগে যায় না।
- পেজ `/settings/knowledge` (অ্যাডমিন): AI চালু/বন্ধ, হ্যান্ডঅফ বার্তা, ঘণ্টার সীমা, লেখা যোগ/সম্পাদনা/বন্ধ/মোছা। উত্তর সঠিক রাখতে দাম/তারিখ হালনাগাদ রাখা অ্যাডমিনের দায়িত্ব।

## কন্টাক্ট, ট্যাগ, merge, CSV (ধাপ ১১-তে সিদ্ধান্ত)

- `src/core/contacts/`: `queries.ts` (তালিকা: সার্চ/ট্যাগ/চ্যানেল ফিল্টার, শেষ কার্যকলাপ অনুযায়ী, ৫০টি করে পাতা), `mutations.ts`, `import.ts`, `csv.ts`, `phone.ts`। পেজ: `/contacts`, `/contacts/[id]`, `/contacts/import`।
- **ট্যাগ**: নাম case-insensitive unique ("VIP" = "vip"), ≤৪০ অক্ষর। ট্যাগ মুছলে কন্টাক্ট থেকে সরে যায়, কন্টাক্ট মোছে না। সবাই ট্যাগ বানাতে/লাগাতে পারে; **ট্যাগ মোছা, merge ও CSV import শুধু অ্যাডমিন**।
- **Merge** (`mergeContacts(keep, merge)`): একই মানুষের WhatsApp ও Messenger কন্টাক্ট এক করে। পরিচিতি, কথোপকথন, ট্যাগ (union) keep-এ যায়; নোট জোড়া লাগে; keep-এর নাম থাকে (না থাকলে অন্যটার); মেসেজ ইতিহাস অক্ষত; merge হওয়া কন্টাক্ট মোছে। **ফেরানো যায় না**, তাই UI-তে টিক-নিশ্চিতকরণ। স্বয়ংক্রিয় merge নেই (ভুল মেলানোর ঝুঁকি)।
- **CSV import**: কলাম নাম ইংরেজি/বাংলা (name/নাম, phone/মোবাইল, tags/ট্যাগ), delimiter স্বয়ংক্রিয় (কমা/সেমিকোলন/ট্যাব), BOM ঠিক। নম্বর normalize (`01711-000001`, `+8801711…`, `০১৭১১…` সব → `8801711…`)। শুধু WhatsApp চ্যানেলে; ≤৫০০০ সারি, ≤২ MB। **আগে থেকে থাকা নাম কখনো বদলায় না** (শুধু ট্যাগ যোগ হয়); ফাইলের ভেতর একই নম্বর বারবার থাকলে গোনা হয়, ডুপ্লিকেট হয় না; ত্রুটিপূর্ণ সারি লাইন-নম্বরসহ দেখায়, বাকিগুলো যায়। **Dry run** (ডিফল্ট টিক): একই transaction চালিয়ে rollback, কিছু সেভ হয় না।
- **opt-in**: import করা কন্টাক্টরা WhatsApp broadcast পেতে সম্মত কি না, সিস্টেম এখনো ট্র্যাক করে না। ধাপ ১২-তে broadcast-এর আগে opt-in ফিল্ড/শর্ত যোগ করতে হবে।
- **শিক্ষা**: drizzle একক-টেবিল select-এ কলাম টেবিল-নাম ছাড়া লেখে; raw `sql` সাবকুয়েরিতে `"id"` ভুল টেবিলে বাঁধে। এমন জায়গায় কলাম পূর্ণ-যোগ্য নামে লেখো, আর টেস্টে শুধু ক্রম নয় আসল মান যাচাই করো।

## Template ও broadcast (ধাপ ১২-তে সিদ্ধান্ত)

- **সম্মতি (opt-in)**: `contacts.opted_in` (ডিফল্ট `false`, উৎস `opt_in_source`)। Broadcast **শুধু সম্মতিপ্রাপ্তদের** কাছে। সম্মতি দেওয়া যায়: অ্যাডমিন কন্টাক্ট-পেজে হাতে, বা CSV import-এ "সবাই সম্মত" টিক দিয়ে। গ্রাহক শুধু `STOP / unsubscribe / optout / opt out / স্টপ / আনসাবস্ক্রাইব` (পুরো মেসেজ, "বন্ধ" নয়) লিখলে সম্মতি নিজে থেকে চলে যায়। পাঠানোর মুহূর্তেও আবার যাচাই হয় (frozen তালিকা তৈরির পরে STOP এলেও মানা হয়)।
- **সুরক্ষা-নিয়ম** (`src/core/broadcast/engine.ts`): শুধু `approved` template ও WhatsApp চ্যানেল; প্রাপক তালিকা তৈরির সময় **জমাট (frozen)** ও সর্বোচ্চ `BROADCAST_MAX_RECIPIENTS` (ডিফল্ট ১০০০); শুধু আসল ফোন নম্বর (BSUID নয়); শুরুর জন্য **প্রাপকের সঠিক সংখ্যা টাইপ** করতে হয়; আসল (non-test) চ্যানেলে `ALLOW_BROADCAST=true`ও লাগে; এক কন্টাক্টে একবারই।
- **Resumable**: প্রতিটা প্রাপক একটা সারি (`broadcast_recipients`), শর্তসাপেক্ষ update দিয়ে claim ⇒ একাধিক worker/ক্র্যাশেও কেউ দুবার পায় না; ৫ মিনিট পুরনো claim ছাড়া হয়; অস্থায়ী ত্রুটিতে (5xx/429/নেটওয়ার্ক) ৩ বার চেষ্টা। সেন্ড `after()`-এ, প্রায় ৬টি/সেকেন্ডে (`delayMs: 160`)। pg-boss নেই; আটকে গেলে অ্যাডমিন "আবার চালান" চাপে।
- **নিজে থেমে যায় (auto-pause)**: ২০টির পর ৩০%-এর বেশি ব্যর্থ হলে; Meta-র template/সীমা সংক্রান্ত ত্রুটি কোডে (`130429, 131048, 131056, 132000, 132001, 132005, 132007, 132012, 132015, 132016, 133010`); বা template আর `approved` না থাকলে। বাকিরা `pending` থাকে, কিছু হারায় না।
- Template জীবনচক্র: Meta থেকে sync, নতুন জমা (`positional {{n}}`, নমুনা মান বাধ্যতামূলক), `message_template_status_update` webhook-এ অবস্থা হালনাগাদ। পাঠানো template ইনবক্সে `type=template` মেসেজ হিসেবে দেখায়; **broadcast থেকে তৈরি কথোপকথন `closed`** (খোলা ইনবক্স ভরে না)।
- **অযাচাইকৃত (Meta ডকে পাইনি, নিজের জানা আচরণে লেখা)**: template তালিকার paging/ফিল্ড; create-এর response; `message_template_status_update` payload (`event`, `message_template_id/name/language`, `reason`); error কোডের তালিকা ও অর্থ (উপরের কোডগুলো); messaging-limit tier ও marketing per-user সীমা (131049); ছবি/বোতাম/header সহ template (শুধু BODY সমর্থিত)। আসল Meta-তে প্রথম পরীক্ষায় এগুলো মিলিয়ে নাও, ভুল ধরা পড়লে parser/কোড ঠিক করো।
- WhatsApp-এর ২৪ ঘণ্টার বাইরে একটা কথোপকথনে ব্যক্তিগতভাবে template পাঠানো (ইনবক্স থেকে) **এখনো নেই**; ইনবক্স এখনো "template লাগে" বলে থামে।

## UI/UX ডিজাইন সিস্টেম (ধাপ ১২-র পরে যোগ হয়েছে)

- **ভাষা**: UI দুই ভাষায়, ডিফল্ট **English**, দ্বিতীয় বাংলা (সাইডবারে English | বাংলা, মোবাইল ও লগইনে এক-ট্যাপ বোতাম; cookie `lang`, ১ বছর)। কোডের মূল লেখা বাংলা; `src/lib/i18n/en/*` ইংরেজি অভিধান বাংলা লেখাকে key ধরে (gettext-ধাঁচ)। UI-তে `t("বাংলা লেখা", {n})` (server: `await getT()`, client: `useI18n()`); `src/core`-এর তৈরি error বার্তা (সংখ্যাসহও) ভাষা-নিরপেক্ষ থাকে, দেখানোর সময় `t(error)` প্যাটার্ন-মিলে অনুবাদ হয়। অভিধানে না থাকলে বাংলা দেখায়, ফাঁকা নয়। `tests/i18n.test.ts` প্রতিটা বাংলা literal-এর ইংরেজি আছে কি না যাচাই করে, তাই নতুন লেখা যোগ করলে অভিধানেও দাও। **গ্রাহকের কাছে যাওয়া লেখা (bot, স্বাগত, অফিস-নোটিস, AI prompt) UI-ভাষার সাথে বদলায় না**, বাংলাই থাকে। পেজের `<title>` এখন শুধু ইংরেজি (cookie-নির্ভর metadata Cache Components-এ সমস্যা করে)।
- **সর্বশেষ রং (ব্যবহারকারীর মকআপ থেকে): উষ্ণ কমলা** — লোগো/সাজসজ্জা `#FF6A13` (সাদা লেখা বসালে ২.৮৭:১, ফেল), লেখা/বোতাম `#C2410C`, dark `#FF8A3D`; আগের WhatsApp-সবুজ বাতিল (বিবরণ `docs/DESIGN.md`)। নিচের WhatsApp-রঙের বিবরণ এখন ইতিহাস। **থিম**: light (ডিফল্ট) ও dark, ব্যবহারকারী `src/components/theme-switch.tsx` দিয়ে বদলায়; `data-theme` অ্যাট্রিবিউট + localStorage `theme`, OS উপেক্ষিত।
- **টোকেন**: `src/app/globals.css`-এ। রং সবসময় অর্থবোধক নামে (`bg-surface`, `text-muted`, `bg-brand`, `bg-danger-soft`, `text-whatsapp`...), কখনো কাঁচা `zinc-*`/`red-*` নয়। light ও dark দুটোই এখানে; **WhatsApp-এর ব্র্যান্ড-রং** (ব্যবহারকারীর পছন্দ; ইন্ডিগো ও Claude-ক্লে বাতিল): ব্র্যান্ড `--brand` গাঢ় টিল, লোগোর `#25D366` শুধু সাজসজ্জা (লেখা বসালে কনট্রাস্ট ১.৯:১), পাঠানো-বাবল WhatsApp Web-এর `#D9FDD3`, Messenger নীল। শৈলী: Soft UI Evolution। বিস্তারিত ও কনট্রাস্ট-টেবিল: `docs/DESIGN.md`; রং বদলালে `npm run design:contrast`। কাঁচা পেলেট ক্লাস ফিরিয়ে আনলে dark mode ভাঙবে।
- **উপাদান**: `src/components/ui.tsx` (`Button/buttonClass`, `fieldClass`, `Field`, `Card`, `Badge`, `Alert`, `PageHeader`, `PageBody`, `Section`, `EmptyState`, `Avatar`, `ChannelBadge`)। নতুন পেজে এগুলো ব্যবহার করো, Tailwind স্ট্রিং নকল করো না। আইকন `lucide-react` (ইমোজি আইকন হিসেবে নিষিদ্ধ)।
- **শেল**: `(app)/layout.tsx` — ডেস্কটপে (lg+) বাঁ সাইডবার, ছোট পর্দায় টপ-বার + ড্রয়ার (`mobile-bar.tsx`, Esc ও ফোকাস সামলায়); সক্রিয় লিংক `app-nav.tsx`-এ; ইনবক্সের অপঠিত সংখ্যা ব্যাজে। পেজ নিজে স্ক্রল করে না, শেলের ভেতরের কন্টেইনার করে; ইনবক্স `h-full`।
- **নীতি** (ui-ux স্কিলের অগ্রাধিকার অনুযায়ী): টাচ-টার্গেট ≥৪৪px (`md`; ঘন সারিতে `sm` ৩৬px), সর্বত্র দৃশ্যমান `:focus-visible` রিং, আইকন-বোতামে `aria-label`, ত্রুটি `role="alert"`, `prefers-reduced-motion` মানা, বাংলার জন্য `line-height: 1.65`, কোনো অনুভূমিক স্ক্রল নয়।
- **যাচাইকৃত**: মোবাইল ৩৭৫px, ট্যাবলেট ৮২০px, ডেস্কটপ ১২৮০px, dark ও light; কনট্রাস্ট `scripts/check-contrast.mjs` দিয়ে মাপা (৫৪ জোড়া, লেখা ≥ ৪.৫:১, গ্রাফিক ≥ ৩:১)। **যাচাই হয়নি**: ১৪৪০px+, স্ক্রিন-রিডারে আসল পরীক্ষা, লগইন পেজের ছবি।
- ফন্ট: Plus Jakarta Sans (ইংরেজি) + Hind Siliguri (বাংলা), `src/app/layout.tsx`-এ। ui-ux স্কিলের ডেটা (সার্চ-স্ক্রিপ্টসহ) একবার GitHub থেকে অস্থায়ী ফোল্ডারে নামানো হয়েছিল (প্রজেক্টের ভেতরে নয়), ব্যবহারকারীর অনুমতিতে।

## Docker ছাড়া ডেভ ডাটাবেস

- `npm run dev:db` PGlite (আসল Postgres, WASM) চালায় `.env`-এর `DATABASE_URL`-এর পোর্টে (ওভাররাইড: `DEV_DB_PORT`); ডেটা `.pglite/`-এ (git-এ যায় না)। প্রথমবার `npm run db:seed-dev` ও `scripts/create-user.ts` দরকার।
- **এই মেশিনে (Saiful-এর) একটা নিজস্ব Postgres 5432 পোর্টে চলে** (Windows service, `crm` রোল নেই), তাই `.env`-এ `POSTGRES_PORT=5433` ও `DATABASE_URL`-এ `:5433` রাখা আছে; Docker ও `dev:db` দুটোই 5433 ব্যবহার করে। ওই Postgres-এ হাত দেওয়া যাবে না। `role "crm" does not exist` ত্রুটি মানে অ্যাপ ভুল Postgres-এ (5432) যাচ্ছে।
- **Docker এখন কাজ করছে** (২০২৬-১১-০৭): container `saimum-crm-db-1` (postgres:16-alpine) `127.0.0.1:5433`-এ। `docker` কমান্ড PATH-এ না থাকলে পুরো পাথ: `C:\Users\User\AppData\Local\Programs\DockerDesktop\resources\bin`। Docker Desktop-এর ডিস্ক ইমেজ C: ড্রাইভে থাকে; **C: পূর্ণ হলে** Docker "unable to start" বলে ও image pull `input/output error` দেয় (এটাই আগে ঘটেছিল)। তখন C: খালি করো বা Docker Settings → Resources → Disk image location E: ড্রাইভে সরাও। Docker না চললে `dev:db` ব্যবহার করা যায়।
- ডেভ লগইন (শুধু লোকাল, আসল ইউজার নয়): `admin@dev.local` ও `agent@dev.local`, পাসওয়ার্ড `dev-pass-12345` (`scripts/create-user.ts` দিয়ে বসানো)। আসল admin বানিয়ে এগুলো মুছে ফেলো।
- `npm run db:seed-dev` দুই টেস্ট চ্যানেল ও নমুনা কথোপকথন বসায় (আসল চ্যানেল থাকলে অস্বীকার করে)। Token নকল, তাই উত্তর পাঠালে Meta `Invalid OAuth access token` দেবে।
- শুধু ডেভেলপমেন্টের জন্য; production-এ Docker Compose-এর আসল PostgreSQL।

- `src/db/index.ts` `DATABASE_URL` না থাকলেও import-এ throw করে না (Docker image build-এর জন্য)।
