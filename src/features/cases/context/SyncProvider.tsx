// ============================================================
// SyncProvider — component half of the iMed-sync context.
// The context object and useSync hook live in SyncContext.tsx
// (kept component-free for fast refresh).
// Also owns the sync confirmation dialog: a sync re-pulls the
// hospital's records over the dashboard, so it is asked about
// once here rather than at each of its trigger points.
// ============================================================
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { SyncCtx } from "./SyncContext";
import { useLang } from "./LanguageContext";
import { ConfirmDialog } from "../components/global/ConfirmDialog";
import { syncFromHospital, type SyncWindow } from "../api/casesService";
import { formatDate } from "../utils/formatDate";

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { t } = useLang();
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState("sync.ago2m");
  const [syncVersion, setSyncVersion] = useState(0);
  // `null` = no dialog open; a value = the window the pending sync would use
  // (wrapped, because the "sync everything" window is itself undefined)
  const [pending, setPending] = useState<{ window?: SyncWindow } | null>(null);

  const runSync = (window?: SyncWindow) => {
    if (syncing) return;
    setSyncing(true);
    void (async () => {
      try {
        await syncFromHospital(window);
        setLastSync("sync.justNow");
        setSyncVersion((v) => v + 1);
      } catch {
        setLastSync("sync.failed");
      } finally {
        setSyncing(false);
      }
    })();
  };

  const requestSync = (window?: SyncWindow) => {
    if (syncing) return;
    setPending({ window });
  };

  const windowLabel = pending?.window
    ? `${pending.window.from ? formatDate(pending.window.from) : "…"} – ${pending.window.to ? formatDate(pending.window.to) : "…"}`
    : null;

  return (
    <SyncCtx.Provider value={{ syncing, lastSync, syncVersion, runSync, requestSync }}>
      {children}
      {pending && (
        <ConfirmDialog
          icon={RefreshCw}
          title={t("confirm.sync.title")}
          body={windowLabel
            ? t("confirm.sync.bodyWindow", { window: windowLabel })
            : t("confirm.sync.bodyAll")}
          confirmLabel={t("confirm.sync.confirm")}
          onConfirm={() => { const { window } = pending; setPending(null); runSync(window); }}
          onClose={() => setPending(null)}
        />
      )}
    </SyncCtx.Provider>
  );
}
