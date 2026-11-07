# Saimum CRM

Saimum Shilpigosthi-র নিজস্ব CRM: WhatsApp Business (Coexistence) আর Facebook Messenger এক inbox-এ, সাথে auto-reply আর AI bot।

- প্রজেক্টের নিয়ম ও সিদ্ধান্ত: `CLAUDE.md`
- পরিকল্পনা: `docs/PLAN.md`
- Meta API নোট: `docs/META_NOTES.md`

## লোকালে চালানো

```bash
npm install
cp .env.example .env   # তারপর পাসওয়ার্ড ও secret বদলাও
npm run db:up          # Docker-এ PostgreSQL (পোর্ট POSTGRES_PORT, ডিফল্ট 5432)
npm run db:migrate     # টেবিল তৈরি
# Docker না থাকলে/চললে না: npm run dev:db  (PGlite, আলাদা টার্মিনালে)
npm run dev            # http://localhost:3000
```

অন্য কমান্ড: `npm test`, `npm run typecheck`, `npm run lint`, `npm run db:generate` (স্কিমা বদলালে), `npm run db:studio`।

## Claude Code দিয়ে শুরু

```bash
cd saimum-crm
git init
claude
```

প্রথম মেসেজে লিখুন:

> CLAUDE.md আর docs ফোল্ডার পড়ো। তারপর কাজের ক্রমের ধাপ ১ শুরু করো: Next.js + Tailwind প্রজেক্ট, Docker-এ PostgreSQL আর ORM সেটআপ। শুরুর আগে তোমার পরিকল্পনা বাংলায় দেখাও।
