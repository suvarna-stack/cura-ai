import { useTheme } from "../../context/ThemeContext";

export function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { gl } = useTheme();
  return (
    <div
      className={`rounded-2xl ${className}`}
      style={{
        background: gl.card,
        backdropFilter: gl.blur20,
        WebkitBackdropFilter: gl.blur20,
        border: gl.border,
        boxShadow: gl.shadow,
      }}
    >
      {children}
    </div>
  );
}
