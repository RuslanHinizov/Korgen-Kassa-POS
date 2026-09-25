"use client";

import { useEffect } from "react";
import { reportClientError } from "@/components/support/error-reporter";

// Last resort: an error so deep that even the root layout failed. Plain HTML, no providers.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportClientError(error, { kind: "boundary", note: "global" }); }, [error]);
  return (
    <html lang="ru">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
        <div style={{ textAlign: "center", padding: 24, maxWidth: 420 }}>
          <h2 style={{ color: "#15503A" }}>Что-то пошло не так</h2>
          <p style={{ color: "#475569" }}>Мы уже получили сообщение об ошибке. Попробуйте обновить страницу.</p>
          <button onClick={reset} style={{ marginTop: 12, background: "#15503A", color: "#fff", border: 0, borderRadius: 8, padding: "10px 18px", fontSize: 15, cursor: "pointer" }}>Обновить</button>
        </div>
      </body>
    </html>
  );
}
