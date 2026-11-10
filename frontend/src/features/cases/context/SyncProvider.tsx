// ============================================================
// SyncProvider — component half of the iMed-sync context.
// The context object and useSync hook live in SyncContext.tsx
// (kept component-free for fast refresh).
// Also owns both sync dialogs — the period picker, then the
// confirmation (a sync re-pulls the hospital's records over the
// dashboard) — so every trigger point gets the same two steps.
// ============================================================
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { SyncCtx } from "./SyncContext";
import { useLang } from "./LanguageContext";
import { ConfirmDialog } from "../components/global/ConfirmDialog";
import { DateRangeDialog } from "../components/global/DateRangeDialog";
import type { DateRange } from "../utils/dateRange";
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
  // `null` = picker closed; otherwise whether "update cases already here" is offered
  const [picker, setPicker] = useState<{ allowRefresh: boolean } | null>(null);

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

  const openSyncPicker = (opts?: { allowRefresh?: boolean }) => {
    if (syncing) return;
    setPicker({ allowRefresh: opts?.allowRefresh ?? true });
  };

  const windowLabel = pending?.window
    ? `${pending.window.from ? formatDate(pending.window.from) : "…"} – ${pending.window.to ? formatDate(pending.window.to) : "…"}`
    : null;

  return (
    <SyncCtx.Provider value={{ syncing, lastSync, syncVersion, runSync, requestSync, openSyncPicker }}>
      {children}
      {picker && (
        <DateRangeDialog
          value={null}
          title={t("sync.period")}
          confirmLabel={t("sync.button")}
          allLabel={t("sync.refreshKnown")}
          allowAll={picker.allowRefresh}
          onApply={(r: DateRange | null) => requestSync(r ? { from: r.from, to: r.to } : undefined)}
          onClose={() => setPicker(null)}
        />
      )}
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
