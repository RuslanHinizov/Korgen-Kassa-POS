"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, SlidersHorizontal } from "lucide-react";
import { StoreLink as Link } from "@/components/store/store-link";
import { AnchoredPopover, useAnchoredPopover } from "@/components/ui/anchored-popover";

export type EmployeeTab = "working" | "dismissed" | "positions" | "access";

const TABS: { key: EmployeeTab; label: string; href: string }[] = [
  { key: "working", label: "Текущие пользователи", href: "/management/employees/working" },
  { key: "dismissed", label: "Бывшие пользователи", href: "/management/employees/dismissed" },
  { key: "positions", label: "Должности", href: "/management/employees/positions" },
  { key: "access", label: "Выдать доступ", href: "/management/employees/access" },
];

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Администратор",
  MANAGER: "Менеджер",
  CASHIER: "Кассир",
  WAREHOUSE: "Складской работник",
};

interface Employee {
  id: string;
  name: string;
  lastName: string | null;
  email: string;
  phone: string | null;
  role: string;
  stores: { id: string; name: string }[];
}
interface Position { role: string; count: number }
interface Store { id: string; name: string }

export function EmployeeTabs({ active }: { active: EmployeeTab }) {
  return (
    <div className="flex gap-6 border-b text-sm font-medium">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`-mb-px border-b-2 pb-2 ${t.key === active ? "border-primary text-primary" : "text-muted-foreground hover:text-foreground border-transparent"}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

/** Управление → Пользователи (Текущие / Бывшие / Должности / Выдать доступ). */
export function EmployeesList({ tab }: { tab: EmployeeTab }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [storeId, setStoreId] = useState("");
  const filter = useAnchoredPopover();

  const load = useCallback(() => {
    if (tab === "access") { setLoading(false); return; }
    setLoading(true);
    const sp = new URLSearchParams({ status: tab === "dismissed" ? "dismissed" : "working" });
    if (q.trim()) sp.set("q", q.trim());
    if (role) sp.set("role", role);
    if (storeId) sp.set("storeId", storeId);
    fetch(`/api/management/employees?${sp}`)
      .then((r) => (r.ok ? r.json() : { employees: [], positions: [] }))
      .then((d) => { setEmployees(d.employees ?? []); setPositions(d.positions ?? []); })
      .finally(() => setLoading(false));
  }, [tab, q, role, storeId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/stores").then((r) => (r.ok ? r.json() : { stores: [] })).then((d) => setStores(d.stores ?? [])).catch(() => {});
  }, []);

  const isList = tab === "working" || tab === "dismissed";
  const filtersActive = Boolean(q || role || storeId);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <EmployeeTabs active={tab} />

      {/* eslint-disable react-hooks/refs -- canary rule false positive on the anchored-popover hook, same pattern as kiosk-top-bar.tsx */}
      {isList && (
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/management/employees/new" className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-medium">
            <Plus className="h-4 w-4" /> Пользователь
          </Link>
          <button
            ref={filter.anchorRef}
            onClick={filter.toggle}
            className={`hover:bg-accent inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium ${filtersActive ? "border-primary text-primary" : ""}`}
          >
            <SlidersHorizontal className="h-4 w-4" /> Фильтр
          </button>
        </div>
      )}

      {filter.open && filter.pos && (
        <AnchoredPopover pos={filter.pos} onClose={filter.close} className="w-72 space-y-3 p-3">
          <label className="block text-xs font-medium">
            ФИО, телефон или почта
            <input value={q} onChange={(e) => setQ(e.target.value)} className="bg-background mt-1 h-9 w-full rounded-md border px-2 text-sm" />
          </label>
          <label className="block text-xs font-medium">
            Должность
            <select value={role} onChange={(e) => setRole(e.target.value)} className="bg-background mt-1 h-9 w-full rounded-md border px-2 text-sm">
              <option value="">Все</option>
              {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="block text-xs font-medium">
            Торговая точка
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="bg-background mt-1 h-9 w-full rounded-md border px-2 text-sm">
              <option value="">Все</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          {filtersActive && (
            <button onClick={() => { setQ(""); setRole(""); setStoreId(""); }} className="text-primary text-xs hover:underline">Сбросить</button>
          )}
        </AnchoredPopover>
      )}

      {/* eslint-enable react-hooks/refs */}

      <div className="bg-card overflow-x-auto rounded-lg border">
        {isList && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground border-b text-xs font-medium">
                <th className="w-12 px-4 py-2.5 text-left">№</th>
                <th className="px-4 py-2.5 text-left">ФИО</th>
                <th className="px-4 py-2.5 text-left">Должность</th>
                <th className="px-4 py-2.5 text-left">Телефон</th>
                <th className="px-4 py-2.5 text-left">Почта</th>
                <th className="px-4 py-2.5 text-left">Торговая точка</th>
                <th className="w-12 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={7} className="text-muted-foreground px-4 py-8 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></td></tr>
              ) : employees.length === 0 ? (
                <tr><td colSpan={7} className="text-muted-foreground px-4 py-8 text-center">Нет пользователей</td></tr>
              ) : (
                employees.map((u, i) => (
                  <tr key={u.id} className="hover:bg-muted/40">
                    <td className="text-muted-foreground px-4 py-2.5">{i + 1}</td>
                    <td className="px-4 py-2.5">{[u.name, u.lastName].filter(Boolean).join(" ")}</td>
                    <td className="px-4 py-2.5">{ROLE_LABEL[u.role] ?? u.role}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{u.phone ?? ""}</td>
                    <td className="px-4 py-2.5">{u.email}</td>
                    <td className="px-4 py-2.5">{u.stores.map((s) => <div key={s.id}>{s.name}</div>)}</td>
                    <td className="px-4 py-2.5">
                      <Link href={`/management/employees/${u.id}/edit${tab === "dismissed" ? "?isFired=true" : ""}`} className="text-primary hover:bg-accent inline-flex h-8 w-8 items-center justify-center rounded" aria-label="Редактировать">
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {tab === "positions" && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground border-b text-xs font-medium">
                <th className="w-12 px-4 py-2.5 text-left">№</th>
                <th className="px-4 py-2.5 text-left">Должность</th>
                <th className="px-4 py-2.5 text-right">Пользователи</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={3} className="text-muted-foreground px-4 py-8 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></td></tr>
              ) : (
                positions.map((p, i) => (
                  <tr key={p.role} className="hover:bg-muted/40">
                    <td className="text-muted-foreground px-4 py-2.5">{i + 1}</td>
                    <td className="px-4 py-2.5">{ROLE_LABEL[p.role] ?? p.role}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{p.count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {tab === "access" && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground border-b text-xs font-medium">
                <th className="w-12 px-4 py-2.5 text-left">№</th>
                <th className="px-4 py-2.5 text-left">ФИО</th>
                <th className="px-4 py-2.5 text-left">Телефон</th>
                <th className="px-4 py-2.5 text-left">Почта</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={4} className="text-muted-foreground px-4 py-8 text-center">Нет пользователей</td></tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
