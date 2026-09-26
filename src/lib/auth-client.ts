import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "./auth";
import { clearTillAuth } from "./offline/auth";

export const authClient = createAuthClient({
  // No baseURL — uses current window origin so it works on any host/IP
  plugins: [
    inferAdditionalFields<typeof auth>(),
  ],
});

export const {
  signIn,
  signUp,
  useSession,
  getSession,
} = authClient;

/**
 * Signing out also forgets who is working at this till. The offline copy of pages/catalogue stays (the next cashier
 * signs in offline against it); it is wiped only when another market's cashier signs in, see offline/clear.ts.
 */
export const signOut: typeof authClient.signOut = async (...args) => {
  await clearTillAuth();
  return authClient.signOut(...args);
};
