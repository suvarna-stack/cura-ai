// ============================================================
// Stub pages for sidebar destinations that are not built yet.
// ============================================================
import AdminLayout from "../components/AdminLayout";
import { Construction } from "lucide-react";

export default function Placeholder({ title }: { title: string }) {
  return (
    <AdminLayout>
      <h1 className="text-[19px] font-bold mb-1">{title}</h1>
      <div className="mt-6 rounded-xl bg-admin-card border border-admin-border p-10 text-center">
        <Construction size={28} className="text-admin-accent mx-auto mb-3" />
        <p className="text-[13px] font-semibold">Not built yet</p>
        <p className="text-[12px] text-admin-muted mt-1">
          This prototype focuses on AI Training — the live Graph RAG admin page.
        </p>
      </div>
    </AdminLayout>
  );
}
