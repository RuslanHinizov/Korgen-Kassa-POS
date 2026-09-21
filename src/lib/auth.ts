import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db";

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
