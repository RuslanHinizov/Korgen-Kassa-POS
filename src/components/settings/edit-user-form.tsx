"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateUserAction } from "@/app/actions/user-actions";

interface EditUserFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    id: string;
    name: string | null;
    email: string;
    role: "ADMIN" | "MANAGER" | "CASHIER" | "WAREHOUSE";
    storeAssignments: { storeId: string; store: { name: string } }[];
  };
  onSuccess?: () => void;
}

export function EditUserForm({
  open,
  onOpenChange,
  user,
  onSuccess,
}: EditUserFormProps) {
  const t = useTranslations("users");
  const tc = useTranslations("common");
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: user.name || "",
    email: user.email,
    role: user.role,
    pin: "",
    storeIds: user.storeAssignments.map((assignment) => assignment.storeId),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (open) {
      setFormData({
        name: user.name || "",
        email: user.email,
        role: user.role,
        pin: "",
        storeIds: user.storeAssignments.map((assignment) => assignment.storeId),
      });
      setErrors({});
      fetch("/api/stores").then((r) => r.ok ? r.json() : { stores: [] }).then((d) => setStores(d.stores ?? [])).catch(() => {});
    }
  }, [open, user]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setIsLoading(true);

    try {
      const result = await updateUserAction(user.id, formData);

      if (result.error) {
        if ("details" in result && result.details) {
          // Zod validation errors
          const fieldErrors: Record<string, string> = {};
          result.details.forEach((err) => {
            const key = err.path[0] !== undefined ? String(err.path[0]) : "global";
            fieldErrors[key] = err.message;
          });
          setErrors(fieldErrors);
        } else {
          toast.error(result.error as string);
        }
        setIsLoading(false);
        return;
      }

      toast.success(t("saved_ok"));
      setFormData({
        name: user.name || "",
        email: user.email,
        role: user.role,
        pin: "",
        storeIds: user.storeAssignments.map((assignment) => assignment.storeId),
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("err_save"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold">{t("edit_title")}</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">{t("name")}</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder={t("name_placeholder")}
              className="w-full px-3 py-2 rounded-lg border bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {errors.name && (
              <p className="text-xs text-destructive mt-1">{errors.name}</p>
            )}
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Магазины для работы</legend>
            <p className="mb-2 text-xs text-muted-foreground">Кассир или работник склада может работать только в отмеченных магазинах.</p>
            <div className="space-y-1 rounded-md border p-2">
              {stores.map((store) => <label key={store.id} className="flex items-center gap-2 px-1 py-1 text-sm"><input type="checkbox" checked={formData.storeIds.includes(store.id)} onChange={() => setFormData((current) => ({ ...current, storeIds: current.storeIds.includes(store.id) ? current.storeIds.filter((id) => id !== store.id) : [...current.storeIds, store.id] }))} />{store.name}</label>)}
              {stores.length === 0 && <p className="text-xs text-muted-foreground">Магазины загружаются…</p>}
            </div>
          </fieldset>

          <div>
            <label className="block text-sm font-medium mb-1.5">{t("email")}</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, email: e.target.value }))
              }
              placeholder={t("email_placeholder")}
              className="w-full px-3 py-2 rounded-lg border bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {errors.email && (
              <p className="text-xs text-destructive mt-1">{errors.email}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">{t("role")}</label>
            <select
              value={formData.role}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  role: e.target.value as "ADMIN" | "MANAGER" | "CASHIER" | "WAREHOUSE",
                }))
              }
              className="w-full px-3 py-2 rounded-lg border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="ADMIN">{t("role_admin")}</option>
              <option value="MANAGER">{t("role_manager")}</option>
              <option value="CASHIER">{t("role_cashier")}</option>
              <option value="WAREHOUSE">Работник склада</option>
            </select>
            {errors.role && (
              <p className="text-xs text-destructive mt-1">{errors.role}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">PIN для кассы <span className="text-muted-foreground font-normal">(необязательно)</span></label>
            <div className="flex items-center gap-2">
              <input
                type="text" inputMode="numeric" minLength={4} maxLength={12}
                value={formData.pin === "__CLEAR__" ? "" : formData.pin}
                onChange={(e) => setFormData((prev) => ({ ...prev, pin: e.target.value }))}
                placeholder="Оставьте пустым — без изменений"
                className="w-full px-3 py-2 rounded-lg border bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button type="button" onClick={() => setFormData((prev) => ({ ...prev, pin: "__CLEAR__" }))} className="shrink-0 text-xs text-muted-foreground hover:text-destructive">
                Убрать
              </button>
            </div>
            {formData.pin === "__CLEAR__" && <p className="mt-1 text-xs text-muted-foreground">PIN будет удалён при сохранении</p>}
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 rounded-lg border border-input hover:bg-muted transition-colors text-sm font-medium"
            >
              {tc("cancel")}
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium inline-flex items-center gap-2"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isLoading ? tc("saving") : t("save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
