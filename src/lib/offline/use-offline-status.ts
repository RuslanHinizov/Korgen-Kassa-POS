"use client";

import { useSyncExternalStore } from "react";
import { getOfflineStatus, subscribeOfflineStatus, type OfflineStatus } from "./queue";

// What the server renders (and the first client render must match): online, nothing waiting.
const SERVER_SNAPSHOT: OfflineStatus = { online: true, pending: 0, failed: 0, syncing: false, lastSyncAt: null, needsLogin: false };

/** Live connection / upload-queue state of the till. */
export function useOfflineStatus(): OfflineStatus {
  return useSyncExternalStore(subscribeOfflineStatus, getOfflineStatus, () => SERVER_SNAPSHOT);
}
