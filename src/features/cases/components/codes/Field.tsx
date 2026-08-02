// ============================================================
// Label-to-control wiring for the code modals: every field there
// used an orphan <label> (visible but not associated), so screen
// readers announced nameless inputs. Field generates the id pair
// once; the control receives it through the render prop.
// ============================================================
import { useId, type ReactNode } from "react";
import { useTheme } from "../../context/ThemeContext";

export function Field({
  label, className, children,
}: {
  label: ReactNode;
  className?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  const { gl } = useTheme();
  return (
    <div className={className}>
      <label htmlFor={id} className="text-[12px] font-semibold block mb-1.5" style={{ color: gl.muted }}>
        {label}
      </label>
      {children(id)}
    </div>
  );
}
