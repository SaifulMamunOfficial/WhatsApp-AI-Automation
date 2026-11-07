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
- ORM: Prisma বা Drizzle (শুরুতে একটা বেছে নিয়ে এখানে লিখে রাখো)
- Background jobs: Postgres-ভিত্তিক queue (যেমন pg-boss) — আলাদা Redis এড়াতে
- Real-time inbox: Server-Sent Events বা WebSocket
- AI: OpenAI বা Anthropic API (env দিয়ে বাছাই)
- Hosting: Hostinger VPS (KVM 4, Ubuntu 24.04), ডোমেইন `crm.saimum.org`, HTTPS-এর জন্য Caddy বা Nginx
- লোকাল টেস্টে webhook-এর জন্য `cloudflared tunnel --url http://localhost:3000`

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

1. [ ] প্রজেক্টের কাঠামো: Next.js + Tailwind, Docker-এ Postgres, ORM, migration
2. [ ] লগইন ও রোল (admin, agent)
3. [ ] চ্যানেল-ভিত্তিক ডাটাবেস স্কিমা
4. [ ] Channel adapter interface + WhatsApp webhook/sender (টেস্ট নম্বর)
5. [ ] Messenger webhook/sender (টেস্ট পেজ)
6. [ ] Inbox UI (real-time, assign, notes, channel filter)
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
- Meta-র আসল webhook payload-এর নমুনা `tests/fixtures/`-এ রাখো।
