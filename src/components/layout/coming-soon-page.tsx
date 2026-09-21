import { Construction } from "lucide-react";

/** Shared shell for a UMAG menu item we've wired into the nav but haven't
 * built yet — keeps every link in the cloned menu structure clickable while
 * we build out each page for real, one at a time. */
export function ComingSoonPage({ title, description }: { title: string; description?: string }) {
  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">{title}</h1>
      <div className="rounded-lg border border-dashed p-10 flex flex-col items-center text-center gap-3">
        <Construction className="h-8 w-8 text-muted-foreground" />
        <p className="font-medium">Скоро</p>
        {description && <p className="text-sm text-muted-foreground max-w-md">{description}</p>}
      </div>
    </div>
  );
}
