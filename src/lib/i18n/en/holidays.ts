// Holidays (closed days) page and the messages core/automation/holidays returns.
export const holidays: Record<string, string> = {
  "ছুটির দিন": "Holidays",
  "ছুটির দিনে অফিস বন্ধ বলে bot গ্রাহককে এই বার্তা পাঠায় (১২ ঘণ্টায় একবার), স্বাগত বা অফিস-সময়ের বার্তার বদলে। keyword ও AI-র উত্তর আগের মতোই চলে। তারিখ {tz} সময় অনুযায়ী।":
    "On a holiday the office is closed, so the bot sends this message (at most once every 12 hours) instead of the welcome or after-hours message. Keyword and AI answers work as before. Dates follow {tz} time.",
  "এখন ছুটি চলছে: {name}। গ্রাহকরা ছুটির বার্তা পাচ্ছেন (bot চালু থাকলে)।": "A holiday is on now: {name}. Customers are getting the holiday message (if the bot is on).",
  "নতুন ছুটি": "New holiday",
  "ছুটির নাম": "Holiday name",
  "যেমন: ঈদুল ফিতর": "e.g. Eid ul-Fitr",
  "শুরুর তারিখ": "Start date",
  "শেষের তারিখ (এই দিনসহ)": "End date (inclusive)",
  "গ্রাহককে যে বার্তা যাবে": "Message sent to customers",
  "যেমন: ঈদের ছুটি চলছে। ২৩ মার্চ থেকে আমরা আবার খোলা।": "e.g. We are closed for the Eid holiday and open again from 23 March.",
  "ছুটি যোগ করুন": "Add holiday",
  "এখন চলছে": "On now",
  "আসছে": "Upcoming",
  "বন্ধ করা": "Switched off",
  "সম্পাদনা": "Edit",
  "সব ছুটি ({n}টি)": "All holidays ({n})",
  "এখনো কোনো ছুটি নেই।": "No holidays yet.",
  "উপরে প্রথমটা যোগ করুন, যেমন ঈদের ছুটি।": "Add the first one above, for example the Eid holiday.",
  // core/automation/holidays messages
  "তারিখ ঠিক নয়।": "The date is not valid.",
  "শেষের তারিখ শুরুর আগে হতে পারে না।": "The end date cannot be before the start date.",
  "একটা ছুটি সর্বোচ্চ ৬০ দিনের হতে পারে।": "A holiday can be at most 60 days long.",
  "সর্বোচ্চ ২০০টি ছুটি রাখা যায়।": "At most 200 holidays can be kept.",
  "ছুটি পাওয়া যায়নি।": "Holiday not found.",
};
