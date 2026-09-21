"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PasswordInput } from "@/components/ui/password-input";
import { createUserAction } from "@/app/actions/user-actions";

interface CreateUserFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserCreated?: () => void;
}

export function CreateUserForm({ open, onOpenChange, onUserCreated }: CreateUserFormProps) {
  const t = useTranslations("users");
  const tc = useTranslations("common");
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "CASHIER" as "ADMIN" | "MANAGER" | "CASHIER" | "WAREHOUSE",
    pin: "",
    storeIds: [] as string[],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (open) fetch("/api/stores").then((r) => r.ok ? r.json() : { stores: [] }).then((d) => setStores(d.stores ?? [])).catch(() => {});
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setLoading(true);

    try {
      const result = await createUserAction(formData);

      if (result.error) {
        if (typeof result.error === "object") {
          // Field errors from Zod
          setErrors(
            Object.entries(result.error as Record<string, string[]>).reduce(
              (acc, [key, msgs]) => {
                acc[key] = (msgs as string[])[0];
                return acc;
              },
              {} as Record<string, string>
            )
          );
        } else {
          toast.error(result.error);
        }
        setLoading(false);
        return;
      }

      toast.success(t("created_ok"));
      setFormData({ name: "", email: "", password: "", role: "CASHIER", pin: "", storeIds: [] });
      onOpenChange(false);
      onUserCreated?.();
    } catch (err) {
      toast.error(t("err_create"));
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="relative w-full max-w-md bg-background rounded-lg shadow-xl border">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-semibold">{t("new_title")}</h3>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 hover:bg-muted rounded transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("name")} *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t("name_placeholder")}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Магазины для работы</legend>
            <p className="text-xs text-muted-foreground">Кассир или работник склада может работать только в отмеченных магазинах.</p>
            <div className="space-y-1 rounded-md border p-2">
              {stores.map((store) => <label key={store.id} className="flex items-center gap-2 px-1 py-1 text-sm"><input type="checkbox" checked={formData.storeIds.includes(store.id)} onChange={() => setFormData((current) => ({ ...current, storeIds: current.storeIds.includes(store.id) ? current.storeIds.filter((id) => id !== store.id) : [...current.storeIds, store.id] }))} />{store.name}</label>)}
              {stores.length === 0 && <p className="text-xs text-muted-foreground">Магазины не найдены</p>}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("email")} *</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder={t("email_placeholder")}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-1.5">
            <PasswordInput
              label={`${t("password")} *`}
              required
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="••••••••"
              error={errors.password}
              className="flex h-9 rounded-md"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("role")} *</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as "ADMIN" | "MANAGER" | "CASHIER" | "WAREHOUSE" })}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="CASHIER">{t("role_cashier")}</option>
              <option value="WAREHOUSE">Работник склада</option>
              <option value="MANAGER">{t("role_manager")}</option>
              <option value="ADMIN">{t("role_admin")}</option>
            </select>
            {errors.role && <p className="text-xs text-destructive">{errors.role}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">PIN для кассы <span className="text-muted-foreground font-normal">(необязательно)</span></label>
            <input
              type="text" inputMode="numeric" minLength={4} maxLength={12}
              value={formData.pin}
              onChange={(e) => setFormData({ ...formData, pin: e.target.value })}
              placeholder="4+ цифры"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">Для быстрого выбора «кто работает» на кассе</p>
          </div>

          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 h-9 rounded-md border border-input hover:bg-muted transition-colors text-sm font-medium"
            >
              {tc("cancel")}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 h-9 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              {loading ? t("creating") : t("create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
