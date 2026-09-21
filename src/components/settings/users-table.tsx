"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Edit2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EditUserForm } from "./edit-user-form";
import { deleteUserAction } from "@/app/actions/user-actions";

interface User {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "CASHIER" | "WAREHOUSE";
  createdAt: Date;
  emailVerified: boolean;
  storeAssignments: { storeId: string; store: { name: string } }[];
}

interface UsersTableProps {
  users: User[];
  onUserDeleted?: (userId: string) => void;
  onUserUpdated?: () => void;
}

export function UsersTable({ users, onUserDeleted, onUserUpdated }: UsersTableProps) {
  const t = useTranslations("users");
  const tc = useTranslations("common");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  async function handleDelete(userId: string) {
    if (!confirm(t("confirm_delete_plain"))) return;

    setDeleting(userId);
    try {
      const result = await deleteUserAction(userId);

      if (result.error) {
        toast.error(result.error as string);
        setDeleting(null);
        return;
      }

      toast.success(t("deleted_ok"));
      onUserDeleted?.(userId);
    } catch (e) {
      toast.error(t("err_delete"));
      setDeleting(null);
    }
  }

  function handleEditClick(user: User) {
    setEditingUser(user);
    setEditOpen(true);
  }

  if (users.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {t("empty_hint")}
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left font-medium">{t("name")}</th>
            <th className="px-4 py-3 text-left font-medium">{t("email")}</th>
            <th className="px-4 py-3 text-left font-medium">{t("role")}</th>
            <th className="px-4 py-3 text-left font-medium">Магазины</th>
            <th className="px-4 py-3 text-left font-medium">{t("created")}</th>
            <th className="px-4 py-3 text-right font-medium">{t("actions")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {users.map((user) => (
            <tr key={user.id} className="hover:bg-muted/50 transition-colors">
              <td className="px-4 py-3">{user.name || t("no_name")}</td>
              <td className="px-4 py-3 font-mono text-xs">{user.email}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                    user.role === "ADMIN"
                      ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                      : user.role === "MANAGER"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                        : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                  }`}
                >
                  {user.role === "ADMIN" ? t("role_admin") : user.role === "MANAGER" ? t("role_manager") : t("role_cashier")}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{user.storeAssignments.map((assignment) => assignment.store.name).join(", ") || "—"}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {new Date(user.createdAt).toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => handleEditClick(user)}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                  >
                    <Edit2 className="h-3 w-3" />
                    {tc("edit")}
                  </button>
                  <button
                    onClick={() => handleDelete(user.id)}
                    disabled={deleting === user.id}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                    {tc("delete")}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editingUser && (
        <EditUserForm
          open={editOpen}
          onOpenChange={setEditOpen}
          user={editingUser}
          onSuccess={() => {
            setEditOpen(false);
            setEditingUser(null);
            onUserUpdated?.();
          }}
        />
      )}
    </div>
  );
}
