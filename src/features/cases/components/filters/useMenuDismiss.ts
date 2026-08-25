import { useEffect, type RefObject } from "react";

/**
 * Outside-click / Escape close for a bar dropdown.
 *
 * Shared by every menu on the filter bar (facets and sort) so they all shut
 * the same way — and so the listeners are bound ONLY while a menu is open,
 * rather than the bar carrying half a dozen idle document listeners.
 */
export function useMenuDismiss(
  open: boolean,
  wrap: RefObject<HTMLElement | null>,
  close: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, wrap, close]);
}
