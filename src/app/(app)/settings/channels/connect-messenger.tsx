"use client";

import { useEffect, useState } from "react";
import { connectPageAction, listPagesAction } from "@/core/channels/actions";

interface FbSdk {
  init(opts: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }): void;
  login(cb: (r: { authResponse?: { accessToken?: string } | null }) => void, opts: { scope: string }): void;
}
// Cast through unknown: connect-whatsapp.tsx declares a different global shape for window.FB.
type FbWindow = { FB?: FbSdk; fbAsyncInit?: () => void };

interface Page {
  id: string;
  name: string;
  canMessage: boolean;
}

// Facebook Login -> pick a Page -> the server stores the Page token (encrypted) and
// subscribes the app. The browser only ever holds the user's login token and page names.
export function ConnectMessenger({ appId, graphVersion, realAllowed }: { appId: string; graphVersion: string; realAllowed: boolean }) {
  const [sdkReady, setSdkReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [userToken, setUserToken] = useState<string | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [isTest, setIsTest] = useState(true);
  const [note, setNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    const w = window as unknown as FbWindow;
    w.fbAsyncInit = () => {
      w.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: graphVersion });
      setSdkReady(true);
    };
    if (w.FB) w.fbAsyncInit();
    else if (!document.getElementById("facebook-jssdk")) {
      const s = document.createElement("script");
      s.id = "facebook-jssdk";
      s.async = true;
      s.defer = true;
      s.crossOrigin = "anonymous";
      s.src = "https://connect.facebook.net/en_US/sdk.js";
      document.body.appendChild(s);
    }
  }, [appId, graphVersion]);

  function login() {
    const w = window as unknown as FbWindow;
    if (!w.FB) return;
    setBusy(true);
    setNote(null);
    w.FB.login(
      (r) => {
        const token = r.authResponse?.accessToken;
        if (!token) {
          setBusy(false);
          setNote({ kind: "error", text: "Facebook লগইন বাতিল বা অসম্পূর্ণ।" });
          return;
        }
        setUserToken(token);
        void listPagesAction(token).then((res) => {
          setBusy(false);
          if (res.ok) setPages(res.pages);
          else setNote({ kind: "error", text: res.error });
        });
      },
      { scope: "pages_show_list,pages_messaging,pages_manage_metadata" },
    );
  }

  async function connect(pageId: string) {
    if (!userToken) return;
    setBusy(true);
    setNote(null);
    const res = await connectPageAction({ userToken, pageId, isTest });
    setBusy(false);
    if (res.ok) {
      setNote({ kind: "ok", text: `সংযুক্ত হয়েছে: ${res.name}। Bot বন্ধ আছে।` });
      setPages([]);
      setUserToken(null);
    } else {
      setNote({ kind: "error", text: res.error });
    }
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={login} disabled={!sdkReady || busy} className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {busy ? "অপেক্ষা করুন…" : "Facebook দিয়ে পেজ বেছে নিন"}
      </button>
      {!sdkReady && <p className="text-xs text-zinc-500">Facebook SDK লোড হচ্ছে…</p>}

      {pages.length > 0 && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isTest} onChange={(e) => setIsTest(e.target.checked)} />
            এটা টেস্ট পেজ{!realAllowed && " (আসল পেজ সংযোগ বন্ধ আছে)"}
          </label>
          <ul className="space-y-1">
            {pages.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
                <span>
                  {p.name} {!p.canMessage && <em className="text-xs text-red-600">(মেসেজের অনুমতি নেই)</em>}
                </span>
                <button type="button" disabled={busy || !p.canMessage || (!isTest && !realAllowed)} onClick={() => connect(p.id)} className="rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-zinc-700">
                  সংযুক্ত করুন
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {note && (
        <p role="status" className={`rounded px-3 py-2 text-sm ${note.kind === "ok" ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200" : "bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-200"}`}>
          {note.text}
        </p>
      )}
    </div>
  );
}
