// ============================================================
// Toast context — pages call showToast(message, logId) right after
// addLog() so every logged action surfaces an undoable toast.
// The toast queue + rendering live in App.tsx (one visible at a
// time; the rest wait their turn).
// ============================================================
import { createContext, useContext } from "react";

type ToastCtxValue = {
  /** Queue a toast. Pass the addLog() return value as logId to get an Undo
   *  button; omit it (empty string) for a plain informational toast. */
  showToast: (message: string, logId?: string) => void;
};

export const ToastCtx = createContext<ToastCtxValue>({ showToast: () => {} });

export const useToast = () => useContext(ToastCtx);
