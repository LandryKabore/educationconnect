import type { Blocker } from "react-router-dom";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui";
import { UNSAVED_ROLLCALL_MESSAGE } from "@/hooks/useUnsavedChangesGuard";

export function UnsavedChangesDialog({
  blocker,
  title = "Appel non validé",
  message = UNSAVED_ROLLCALL_MESSAGE,
}: {
  blocker: Blocker;
  title?: string;
  message?: string;
}) {
  return (
    <Modal
      open={blocker.state === "blocked"}
      title={title}
      onClose={() => blocker.state === "blocked" && blocker.reset()}
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => blocker.state === "blocked" && blocker.reset()}
        >
          Rester
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={() => blocker.state === "blocked" && blocker.proceed()}
        >
          Quitter quand même
        </Button>
      </div>
    </Modal>
  );
}
