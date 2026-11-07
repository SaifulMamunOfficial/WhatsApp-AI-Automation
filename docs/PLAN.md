# বাস্তবায়ন পরিকল্পনা — সংক্ষেপ

পূর্ণ পরিকল্পনা (Claude Docs): https://claude.ai/artifact/PznRcCtCygHFDowaLyTeja

আনুমানিক মোট সময়: ৯–১২ সপ্তাহ, যার বেশিরভাগ কোড লেখায়।

## সময়রেখা

1. সপ্তাহ ১: বাকি প্রস্তুতি আর 2FA; WhatsApp ও Messenger permission চেয়ে App Review-এর আবেদন শুরু
2. সপ্তাহ ১–২: প্রজেক্টের কাঠামো, চ্যানেল-ভিত্তিক ডাটাবেস, লগইন; টেস্ট নম্বর ও টেস্ট পেজ সংযোগ
3. সপ্তাহ ২–৪: চ্যানেল adapter, দুই চ্যানেলের webhook ও মেসেজ পাঠানো, Inbox
4. সপ্তাহ ৩–৫: WhatsApp Coexistence (Embedded Signup, echo, history, কন্টাক্ট সিঙ্ক)
5. সপ্তাহ ৪–৫: Facebook Page সংযোগ আর Messenger echo
6. সপ্তাহ ৫–৭: Keyword মেনু, অফিস সময়ের বাইরে auto-reply, AI bot আর knowledge base
7. সপ্তাহ ৭–৮: কন্টাক্ট ট্যাগ আর WhatsApp template broadcast
8. সপ্তাহ ৮–৯: VPS-এ deploy আর পূর্ণ পরীক্ষা
9. সপ্তাহ ৯–১২: আসল নম্বর আর পেজ যুক্ত করা (bot বন্ধ রেখে), তারপর ধাপে ধাপে bot চালু

## প্রস্তুতির অবস্থা

- [x] Meta Business Portfolio (Saimum Shilpigosthi)
- [x] Business verification (৩১ অক্টোবর ২০২৩)
- [x] Facebook Page Portfolio-তে যুক্ত
- [x] Hostinger VPS (KVM 4, Ubuntu 24.04)
- [ ] Portfolio-র ১ জনের 2FA
- [ ] Primary Page-এর "Review needed" সমাধান
- [ ] WhatsApp প্রোফাইলের ওয়েবসাইট লিংক saimun.org → saimum.org (যদি ভুল হয়)
- [ ] কোন কোন পেজ যুক্ত হবে ঠিক করা + একটা টেস্ট পেজ
- [ ] `crm.saimum.org` সাবডোমেইন
- [ ] লোকালে Node.js 22+, Git, Docker Desktop, cloudflared
- [ ] Meta App + টেস্ট নম্বর
- [ ] Privacy Policy ও Terms পেজ
- [ ] AI API key
- [ ] Bot-এর জন্য সাধারণ প্রশ্ন-উত্তরের তালিকা

## বাস্তবায়নের অবস্থা

- [x] ধাপ ১: Next.js 16 + Tailwind 4, Drizzle ORM, `docker-compose.yml` (Postgres 16), Vitest, `src/` কাঠামো। `build`, `typecheck`, `lint`, `test` পাস।
- [ ] ধাপ ১ বাকি যাচাই: Docker Desktop ইনস্টল করে `npm run db:up` ও `npm run db:migrate` চালানো।
- [x] ধাপ ২: লগইন/লগআউট, DB session, admin/agent রোল, proxy সুরক্ষা, `scripts/create-user.ts`। টেস্ট (পাসওয়ার্ড, token, rate limit, role) ও build পাস।
- [ ] ধাপ ২ বাকি যাচাই: Docker চালু করে migration (`0001`) চালানো, `create-user` দিয়ে admin বানিয়ে ব্রাউজারে লগইন/লগআউট দেখা।
- [x] ধাপ ৩: চ্যানেল-ভিত্তিক স্কিমা (channels, contacts + identities, conversations, messages, notes, tags, templates, automations, knowledge_base) আর AES-256-GCM token এনক্রিপশন (`src/lib/crypto.ts`)। টেস্ট পাস।
- [ ] Docker ঠিক হলে একসাথে যাচাই: `db:migrate` (0000–0002), `create-user`, ব্রাউজারে লগইন/লগআউট। Docker Desktop ইনস্টল আছে কিন্তু engine চালু হচ্ছে না (ব্যবহারকারী পরে দেখবেন)।
- [x] ধাপ ৪: WhatsApp webhook (GET verify, POST সই-যাচাই), parser (text, media caption, button/list reply, echo, status), sender (Graph API), ingest (idempotent)। ৪৮টি টেস্ট পাস, PGlite-এ migration সহ।
- [ ] ধাপ ৪ বাকি: Meta App ও টেস্ট নম্বর তৈরির পর `cloudflared` দিয়ে আসল end-to-end পরীক্ষা (মেসেজ পাঠানো → inbox-এ দেখা, উত্তর পাঠানো)। Sender এখনো কোনো UI-তে যুক্ত নয় (ধাপ ৬)।
- [x] ধাপ ৫: Messenger webhook (`/api/webhooks/messenger`), parser (text, attachment, postback, echo), sender (RESPONSE ও HUMAN_AGENT), echo-তে `app_id` দিয়ে নিজের/মানুষের মেসেজ আলাদা করা। ৬১টি টেস্ট পাস।
- [ ] ধাপ ৫ বাকি: টেস্ট Page তৈরি ও Meta App-এ সাবস্ক্রাইব (`messages`, `message_echoes`, `messaging_postbacks`) করে আসল end-to-end পরীক্ষা; নমুনা payload আসল ধরা payload দিয়ে বদলানো (`tests/fixtures/messenger/README.md`)।
- [x] ধাপ ৬: Inbox (তালিকা, থ্রেড, নোট, assign, বন্ধ/খোলা, bot আবার চালু, সার্চ, চ্যানেল/দায়িত্ব ফিল্টার, SSE real-time, উত্তর পাঠানো ২৪ ঘণ্টার নিয়ম মেনে)। ৮৩টি টেস্ট পাস। ব্রাউজারে PGlite ডেভ DB-তে যাচাই: লগইন (ধাপ ২), তালিকা, নোট, assign, উত্তর-ব্যর্থতার পথ (Meta-র আসল error ফেরত), ২৪ঘ/৭দিন নিয়ম।
- [ ] ধাপ ৬ বাকি: আসল Meta টেস্ট নম্বর/পেজে উত্তর পাঠানোর end-to-end; ছবি/অডিও দেখানো (এখন শুধু `[ছবি]` লেবেল); পুরনো মেসেজ "আরও লোড" (এখন সর্বশেষ ২০০টি); Messenger কাস্টমারের নাম আনা।
- [x] Docker যাচাই সম্পন্ন (২০২৬-১১-০৭): Postgres 16 container চালু (`127.0.0.1:5433`, কারণ মেশিনের নিজস্ব Postgres 5432-এ আছে), migration `0000`–`0002` প্রয়োগ (১৪টি টেবিল), `create-user` ও `seed-dev` সফল, ব্রাউজারে লগইন ও ইনবক্স আসল Postgres-এ কাজ করছে। প্রথম চেষ্টায় C: ড্রাইভ পূর্ণ থাকায় image pull ব্যর্থ হয়েছিল।
- [x] ধাপ ৭: history import (source=history, unread/bot-pause নেই, পুরনো চ্যাট "বন্ধ" অবস্থায়), contact sync (add নাম বসায়, remove কিছু মোছে না), Embedded Signup সার্ভার-অংশ (token exchange, is_on_biz_app যাচাই, webhook subscribe, smb_app_data একবারই), অ্যাডমিন পেজ `/settings/channels`। migration `0003`। ১১৬টি টেস্ট পাস।
- [ ] ধাপ ৭ বাকি: আসল Meta App + Tech Provider সেটআপের পর Embedded Signup-এর end-to-end (FB SDK অংশ এখনো ব্রাউজারে পরীক্ষিত নয়); আসল history/state_sync payload ধরে fixture বদলানো; media (`media_placeholder`) পরে আলাদা webhook-এ আসে, এখনো ধরা হয়নি।
- [x] ধাপ ৮: Facebook Page সংযোগ: লগইন → পরিচালিত পেজের তালিকা (token ছাড়া) → বেছে সংযুক্ত (long-lived exchange, MESSAGING/MANAGE অনুমতি যাচাই, `subscribed_apps` = messages, message_echoes, messaging_postbacks, token এনক্রিপ্ট)। ১২৫টি টেস্ট পাস।
- [ ] ধাপ ৮ বাকি: আসল Meta App + টেস্ট পেজে Facebook Login end-to-end; `pages_*` permission-এর App Review; Messenger কাস্টমারের নাম Graph থেকে আনা (এখন PSID দেখায়); ডকে অযাচাইকৃত: Page token মেয়াদ, `/me/accounts`।
- [ ] ধাপ ৯ থেকে: `CLAUDE.md`-র কাজের ক্রম দেখো।

## VPS deploy (ধাপ ৫)

1. Docker Compose: অ্যাপ + PostgreSQL (DB বাইরে খোলা নয়)
2. `crm.saimum.org` DNS → VPS; Caddy/Nginx দিয়ে HTTPS
3. গোপন মান শুধু সার্ভারের `.env`-এ
4. Meta-তে স্থায়ী webhook URL: `https://crm.saimum.org/api/webhooks/whatsapp` ও `/api/webhooks/messenger`
5. প্রতিদিন DB ব্যাকআপ + VPS snapshot
