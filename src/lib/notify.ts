/**
 * Alerts to the platform owner's phone through a Telegram bot. Optional: when TELEGRAM_BOT_TOKEN /
 * TELEGRAM_CHAT_ID are not set nothing is sent (errors still land in /superadmin/errors).
 * Never throws — an alert must not break the request that triggered it.
 */
const API_BASE = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";

export function alertsEnabled(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

// storm guard: at most 20 alerts per hour from this process
let windowStart = Date.now();
let sentInWindow = 0;

export async function sendAlert(text: string): Promise<boolean> {
  if (!alertsEnabled()) return false;
  const now = Date.now();
  if (now - windowStart > 3_600_000) { windowStart = now; sentInWindow = 0; }
  if (sentInWindow >= 20) return false;
  sentInWindow += 1;
  try {
    const res = await fetch(`${API_BASE}/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: text.slice(0, 3500), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Absolute link into the app for use inside alerts. */
export function appLink(path: string): string {
  const base = (process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}
