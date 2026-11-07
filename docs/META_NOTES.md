# Meta API — প্রযুক্তিগত নোট

কোড লেখার সময় সঠিক তথ্যের জন্য সবসময় Meta-র অফিশিয়াল ডকুমেন্টেশন মিলিয়ে নাও; নিচের তথ্য ২০২৬-১১-০৭ তারিখে যাচাই করা।

## Meta App

- একটাই Meta App (Business টাইপ), Saimum Shilpigosthi Portfolio-র অধীনে। প্রোডাক্ট: WhatsApp + Messenger।
- App Review-এ যা চাইতে হবে:
  - WhatsApp: `whatsapp_business_management`, `whatsapp_business_messaging` (Advanced access)
  - Messenger: `pages_messaging`, `pages_manage_metadata`, `pages_show_list`
  - Human Agent feature (Messenger-এ ২৪ ঘণ্টার পরে ৭ দিন পর্যন্ত মানুষের উত্তর)
- Coexistence-এর জন্য App-কে Tech Provider হতে হবে: App Dashboard → WhatsApp → Quickstart → "Become a Tech Provider" → Independent Tech Provider। পরে App Settings → Basic থেকে Access Verification।
- Portfolio-র সবার two-factor authentication চালু থাকতে হবে।

## WhatsApp Coexistence (বিদ্যমান Business App নম্বর)

সূত্র: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users

- শর্ত: Business App ভার্সন 2.24.17+; Embedded Signup with session logging; webhook কাজ করতে হবে।
- Embedded Signup-এর `extras`-এ: `featureType: "whatsapp_business_app_onboarding"`, `sessionInfoVersion: "3"`। শেষে `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` event-এ `waba_id` আসে।
- Webhook fields subscribe: `messages`, `history`, `smb_app_state_sync`, `smb_message_echoes`।
- অনবোর্ডিংয়ে phone number registration (`/register`) **বাদ** দিতে হবে।
- ঐচ্ছিক যাচাই: phone number ID-তে `is_on_biz_app`, `platform_type`।
- ২৪ ঘণ্টার মধ্যে `smb_app_data` কল, `sync_type: smb_app_state_sync` → কন্টাক্ট সিঙ্ক।
- তারপর `smb_app_data`, `sync_type: history` → ৬ মাস পর্যন্ত ১:১ চ্যাট history। **শুধু একবার** করা যায়।
- `smb_message_echoes` প্রসেস করে ফোন থেকে পাঠানো মেসেজ CRM-এ দেখাতে হবে।
- সীমাবদ্ধতা (অ্যাপে): broadcast list শুধু পড়া যায়; disappearing, view once, live location বন্ধ; linked device আনলিংক হয় (Windows আর WearOS আবার লিংক করা যায় না); গ্রুপ API-তে সিঙ্ক হয় না; throughput 20 mps।
- ফোন প্রায় ১৪ দিন নিষ্ক্রিয় থাকলে সংযোগ কেটে যায়। Business App আনইনস্টল করা যাবে না।
- অ্যাপ থেকে পাঠানো মেসেজ ফ্রি; API মেসেজে Cloud API-র রেট। ২৪ ঘণ্টার window শুধু API মেসেজে প্রযোজ্য।

## Facebook Messenger

সূত্র: https://developers.facebook.com/docs/messenger-platform/reference/send-api

- পাঠাতে লাগে: পেজে MESSAGE task আছে এমন কারও Page access token, `pages_messaging`, আর গ্রাহক গত ২৪ ঘণ্টায় মেসেজ দিয়েছে।
- `messaging_type`: `RESPONSE` (২৪ ঘণ্টার মধ্যে), `MESSAGE_TAG` (বাইরে, tag সহ)।
- `HUMAN_AGENT` tag: গ্রাহকের মেসেজের ৭ দিনের মধ্যে, শুধু মানুষের উত্তর; App Review-এ Human Agent অনুমোদন লাগে। Bot এটা ব্যবহার করতে পারবে না।
- ২৭ এপ্রিল ২০২৬ থেকে `CONFIRMED_EVENT_UPDATE`, `ACCOUNT_UPDATE`, `POST_PURCHASE_UPDATE` tag বাতিল (error 100)।
- ২৮ সেপ্টেম্বর ২০২৬ থেকে Click to Messenger বিজ্ঞাপন থেকে শুরু চ্যাটে standard window ৭ দিন পর্যন্ত হতে পারে।
- Webhook fields (page subscription): `messages`, `message_echoes`, `messaging_postbacks`। কন্টাক্ট চেনা যায় Page-scoped ID (PSID) দিয়ে।
- পেজ ইনবক্স (Meta Business Suite) থেকে কেউ উত্তর দিলে `message_echoes` আসে → ওই কথোপকথনে bot থামাতে হবে। Business Suite-এর নিজস্ব অটো-রিপ্লাই বন্ধ রাখতে হবে।
- Messenger পুরোপুরি ফ্রি।

## Go-live নিয়ম

- আসল WhatsApp নম্বর যুক্ত করার আগের দিন: অ্যাপ আপডেট, Google Drive ব্যাকআপ, broadcast list-এর তালিকা রাখা, Windows অ্যাপ ব্যবহারকারীদের Web-এ সরানো।
- সংযোগের সময়: ফোন চার্জারে, স্থির Wi-Fi, chat share-এ হ্যাঁ, সিঙ্ক শেষ না হওয়া পর্যন্ত অ্যাপ খোলা।
- প্রথম ১–২ সপ্তাহ bot বন্ধ (শুধু inbox), তারপর অফিস সময়ের বাইরে, তারপর ২৪ ঘণ্টা।
- পেজের ক্ষেত্রে আগে কম ব্যস্ত পেজ (Saimum KIDS), তারপর মূল পেজ।
