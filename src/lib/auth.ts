import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db";
import { headers as requestHeaders } from "next/headers";
import { resolveDeviceSession } from "./device-access";

// A guessable signing secret lets anyone forge a session cookie, so a production server refuses to start
// with a short or placeholder one (not enforced during `next build`, when runtime env is not present).
const authSecret = process.env.BETTER_AUTH_SECRET ?? "";
if (
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PHASE !== "phase-production-build" &&
  (authSecret.length < 32 || /change_?me|placeholder|example/i.test(authSecret))
) {
  throw new Error("BETTER_AUTH_SECRET is missing, shorter than 32 characters, or still a placeholder. Run: node scripts/gen-secrets.mjs <domain>");
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: process.env.BETTER_AUTH_SECRET!,
  // baseURL must match the origin making requests.
  // In dev you may access via localhost OR a network IP — trust both.
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS
    ? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(",").map((o) => o.trim())
    // In dev allow any private-network origin so accessing via IP works out of the box
    : process.env.NODE_ENV === "production"
      ? []
      : ["http://localhost:3000", "http://127.0.0.1:3000", "http://192.168.8.186:3000"],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "CASHIER",
        input: false, // not user-settable via sign-up
      },
    },
  },
  databaseHooks: {
    session: {
      create: {
        // Dismissed employees (Бывшие пользователи) cannot sign in.
        before: async (session) => {
          const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { firedAt: true } });
          if (user?.firedAt) throw new APIError("FORBIDDEN", { message: "Доступ закрыт: сотрудник уволен" });
        },
      },
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 7, // 7 days
    },
  },
});

export type Session = typeof auth.$Infer.Session;
export type AuthUser = typeof auth.$Infer.Session.user;

// The offline till program (no cookie) is recognised by its device token — see device-access.ts.
const realGetSession = auth.api.getSession.bind(auth.api);
(auth.api as unknown as { getSession: unknown }).getSession = async (ctx: { headers?: Headers } & Record<string, unknown>) => {
  let h = ctx?.headers;
  if (!h) {
    try { h = await requestHeaders(); } catch { h = undefined; }
  }
  const device = h ? await resolveDeviceSession(h) : null;
  if (device) return { session: device.session, user: device.user };
  return realGetSession(ctx as never);
};
