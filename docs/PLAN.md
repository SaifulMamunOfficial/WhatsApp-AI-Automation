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

## VPS deploy (ধাপ ৫)

1. Docker Compose: অ্যাপ + PostgreSQL (DB বাইরে খোলা নয়)
2. `crm.saimum.org` DNS → VPS; Caddy/Nginx দিয়ে HTTPS
3. গোপন মান শুধু সার্ভারের `.env`-এ
4. Meta-তে স্থায়ী webhook URL: `https://crm.saimum.org/api/webhooks/whatsapp` ও `/api/webhooks/messenger`
5. প্রতিদিন DB ব্যাকআপ + VPS snapshot
