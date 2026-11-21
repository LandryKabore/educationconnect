import type { ReactNode } from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui";

/** Asks the super admin to confirm a change to a school before it is saved. */
export function AdminConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Confirmer",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  /** red confirm button, for changes that take something away */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} title={title} onClose={onCancel} closeDisabled={busy}>
      <div className="space-y-3 text-sm text-slate-600">{children}</div>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Annuler
        </Button>
        <Button
          type="button"
          variant={danger ? "danger" : "primary"}
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Enregistrement…" : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
