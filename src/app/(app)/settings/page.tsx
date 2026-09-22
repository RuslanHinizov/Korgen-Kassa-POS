import { redirect } from "next/navigation";
import { getStoreId } from "@/lib/store-context";

// Business/branding/currency/etc. settings moved to Управление → Настройки
// (/management/settings) — bare /settings now just forwards to the profile
// tab so old links and the mobile bottom-nav "Настройки" tab still resolve.
export default async function SettingsPage() {
  redirect(`/store/${await getStoreId()}/settings/profile`);
}
