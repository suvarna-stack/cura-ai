// ============================================================
// Shared actionType → icon/color mapping, used by both the
// ActivityDrawer and the ViewHistory timeline so an action always
// looks the same everywhere.
// ============================================================
import { CheckCircle2, Trash2, Plus, Pencil, RefreshCw, Undo2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ActionType } from "../types/activityLog.types";
import type { GL } from "../types/theme.types";

export function actionIcon(actionType: ActionType, gl: GL): { Icon: LucideIcon; color: string } {
  switch (actionType) {
    case "APPROVE_CASE":
    case "APPROVE_ALL": return { Icon: CheckCircle2, color: gl.success };
    case "DELETE_CODE": return { Icon: Trash2, color: "#ef4444" };
    case "ADD_CODE":    return { Icon: Plus, color: gl.accent };
    case "EDIT_CODE":   return { Icon: Pencil, color: "#f59e0b" };
    case "REOPEN_CASE": return { Icon: RefreshCw, color: gl.accent };
    case "UNDO":        return { Icon: Undo2, color: gl.muted };
  }
}
