"use client";

import { useEffect, useRef, useState } from "react";
import { connectWhatsAppAction, type ConnectResult } from "@/core/channels/actions";
import { buttonClass } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

// WhatsApp Coexistence "Embedded Signup": opens Meta's popup where the business scans a QR
// code with its WhatsApp Business App. We receive an exchangeable code (valid 30 seconds)
// plus the waba_id in a window message, and hand both to the server.

interface FbSdk {
  init(opts: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }): void;
  login(
    cb: (response: { authResponse?: { code?: string } | null }) => void,
    opts: Record<string, unknown>,
  ): void;
}
declare global {
  interface Window {
    FB?: FbSdk;
    fbAsyncInit?: () => void;
  }
}

interface SessionInfo {
  wabaId?: string;
  phoneNumberId?: string;
  event?: string;
}

const FINISH_EVENTS = new Set(["FINISH", "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"]);

export function ConnectWhatsApp({ appId, configId, graphVersion }: { appId: string; configId: string; graphVersion: string }) {
  const { t } = useI18n();
  const [sdkReady, setSdkReady] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string[] } | null>(null);
  const session = useRef<SessionInfo>({});

  useEffect(() => {
    // Only trust messages from Facebook.
    const onMessage = (event: MessageEvent) => {
      if (typeof event.origin !== "string" || !event.origin.endsWith("facebook.com")) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (FINISH_EVENTS.has(data.event)) {
          session.current = { wabaId: data.data?.waba_id, phoneNumberId: data.data?.phone_number_id, event: data.event };
        } else if (data.event === "CANCEL") {
          setBusy(false);
          setMessage({ kind: "error", text: [t("সংযোগ বাতিল করা হয়েছে।")] });
        } else if (data.event === "ERROR") {
          setBusy(false);
          setMessage({ kind: "error", text: [t("Meta ত্রুটি: {e}", { e: String(data.data?.error_message ?? t("অজানা")) })] });
        }
      } catch {
        /* not JSON: not ours */
      }
    };
    window.addEventListener("message", onMessage);

    window.fbAsyncInit = () => {
      window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: graphVersion });
      setSdkReady(true);
    };
    if (window.FB) {
      window.fbAsyncInit();
    } else if (!document.getElementById("facebook-jssdk")) {
      const s = document.createElement("script");
      s.id = "facebook-jssdk";
      s.async = true;
      s.defer = true;
      s.crossOrigin = "anonymous";
      s.src = "https://connect.facebook.net/en_US/sdk.js";
      document.body.appendChild(s);
    }
    return () => window.removeEventListener("message", onMessage);
  }, [appId, graphVersion, t]);

  function start() {
    if (!window.FB) return;
    setBusy(true);
    setMessage(null);
    session.current = {};

    window.FB.login(
      (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setBusy(false);
          setMessage({ kind: "error", text: [t("Meta কোনো code দেয়নি (বাতিল বা অসম্পূর্ণ)।")] });
          return;
        }
        void finish(code);
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" },
      },
    );
  }

  async function finish(code: string) {
    // The session event usually arrives just before or after the callback.
    for (let i = 0; i < 40 && !session.current.wabaId; i++) await new Promise((r) => setTimeout(r, 100));
    const { wabaId, phoneNumberId } = session.current;
    if (!wabaId) {
      setBusy(false);
      setMessage({ kind: "error", text: [t("Meta থেকে WhatsApp অ্যাকাউন্টের তথ্য আসেনি। আবার চেষ্টা করুন।")] });
      return;
    }
    let result: ConnectResult;
    try {
      result = await connectWhatsAppAction({ code, wabaId, phoneNumberId });
    } catch {
      setBusy(false);
      setMessage({ kind: "error", text: [t("সার্ভারে সমস্যা হয়েছে।")] });
      return;
    }
    setBusy(false);
    setConfirmed(false);
    if (result.ok) {
      setMessage({
        kind: "ok",
        text: [t("সংযুক্ত হয়েছে: {name}", { name: result.displayPhone ?? result.phoneNumberId }), t("Bot বন্ধ আছে। কন্টাক্ট ও chat history আসতে কিছুক্ষণ লাগতে পারে।"), ...result.warnings.map((w) => t(w))],
      });
    } else {
      setMessage({ kind: "error", text: [t(result.error)] });
    }
  }

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" />
        <span>
          {t("আমি বুঝেছি, এটা প্রতিষ্ঠানের আসল WhatsApp Business নম্বর। সংযোগের সময় ফোন চার্জারে ও স্থির Wi-Fi-তে থাকবে, আর সিঙ্ক শেষ না হওয়া পর্যন্ত WhatsApp Business App খোলা রাখব। Bot শুরুতে বন্ধ থাকবে।")}
        </span>
      </label>
      <button
        type="button"
        onClick={start}
        disabled={!sdkReady || !confirmed || busy}
        className={buttonClass("primary")}
      >
        {busy ? t("অপেক্ষা করুন…") : t("WhatsApp নম্বর সংযুক্ত করুন")}
      </button>
      {!sdkReady && <p className="text-xs text-muted">{t("Facebook SDK লোড হচ্ছে…")}</p>}
      {message && (
        <div role="status" className={`rounded px-3 py-2 text-sm ${message.kind === "ok" ? "bg-success-soft text-fg" : "bg-danger-soft text-fg"}`}>
          {message.text.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}
