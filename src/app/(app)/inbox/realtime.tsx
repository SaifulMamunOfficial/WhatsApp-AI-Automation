"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the server components when the SSE stream reports a change. */
export function Realtime() {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const es = new EventSource("/api/inbox/stream");
    es.onmessage = () => {
      // Coalesce bursts (e.g. a history import) into one refresh.
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };
    return () => {
      clearTimeout(timer);
      es.close();
    };
  }, [router]);

  return null;
}
