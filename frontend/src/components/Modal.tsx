// ============================================================
// Shared modal pattern — overlay + centered card.
// ============================================================

export function Modal({ title, children, onClose }: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-admin-card border border-admin-border shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-admin-border">
          <h3 className="text-[15px] font-bold text-admin-text">{title}</h3>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/** Confirmation dialog: message + Cancel / Confirm buttons. */
export function ConfirmModal({ title, message, confirmLabel, onConfirm, onClose }: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-[13px] text-admin-muted leading-relaxed mb-5">{message}</p>
      <div className="flex justify-end gap-2">
        <button onClick={onClose}
          className="px-4 py-2 rounded-lg text-[13px] font-semibold border border-admin-border text-admin-text hover:bg-black/5 transition-colors">
          Cancel
        </button>
        <button onClick={onConfirm}
          className="px-4 py-2 rounded-lg text-[13px] font-bold bg-admin-accent text-white hover:bg-green-700 transition-colors">
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
