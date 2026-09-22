import type { Metadata } from "next";
import { requireRole } from "@/lib/admin-page";
import { GeneralSettingsForm } from "@/components/management/general-settings-form";
import { DeviceSettingsForm } from "@/components/settings/device-settings-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

export default async function ManagementSettingsPage() {
  await requireRole();
  return (
    <div className="p-4 sm:p-6 max-w-3xl space-y-10">
      <h1 className="text-2xl font-bold">Настройки</h1>
      <GeneralSettingsForm />
      <hr />
      <DeviceSettingsForm />
    </div>
  );
}
