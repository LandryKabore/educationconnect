import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/Modal";
import { Button, DateInputFr, Label, Select, Textarea } from "@/components/ui";
import { EXIT_REASONS, studentExit, studentReinstate } from "@/lib/scaleApi";
import type { ClassSection } from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);

/** « Sortie de l'élève » : départ, transfert, abandon… Le dossier (notes, présences) est conservé. */
export function SortieEleveModal({
  open,
  studentId,
  studentName,
  onClose,
  onDone,
}: {
  open: boolean;
  studentId: string;
  studentName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [leftAt, setLeftAt] = useState(today());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) {
      toast.error("Choisissez le motif de sortie");
      return;
    }
    if (!leftAt) {
      toast.error("Indiquez la date de sortie");
      return;
    }
    setBusy(true);
    try {
      await studentExit(studentId, reason, leftAt, note);
      toast.success(`${studentName} est sorti(e) de l'école — son dossier est conservé`);
      onDone();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sortie impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={`Sortie de ${studentName}`} onClose={onClose} closeDisabled={busy}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">
          L'élève disparaît des listes de classe, des présences et des saisies de notes. Ses notes, ses
          présences et son parcours sont <strong>conservés</strong>. Vous pourrez le réintégrer plus tard.
        </p>
        <div>
          <Label htmlFor="sortie-motif">Motif</Label>
          <Select id="sortie-motif" value={reason} onChange={(e) => setReason(e.target.value)} required>
            <option value="">Choisir…</option>
            {EXIT_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Date de sortie</Label>
          <DateInputFr
            value={leftAt}
            onChange={setLeftAt}
            minYear={new Date().getFullYear() - 1}
            maxYear={new Date().getFullYear()}
            required
          />
          <p className="mt-1 text-xs text-slate-500">Pas dans le futur, et pas plus d'un an en arrière.</p>
        </div>
        <div>
          <Label htmlFor="sortie-note">Remarque (facultatif)</Label>
          <Textarea
            id="sortie-note"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex. : transféré au lycée de Koudougou"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Enregistrement…" : "Enregistrer la sortie"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Réintégration d'un ancien élève (même classe qu'avant, ou une autre classe de l'année en cours). */
export function ReintegrerModal({
  open,
  studentId,
  studentName,
  classes,
  onClose,
  onDone,
}: {
  open: boolean;
  studentId: string;
  studentName: string;
  classes: ClassSection[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [classId, setClassId] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await studentReinstate(studentId, classId || null);
      toast.success(`${studentName} est réintégré(e)`);
      onDone();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Réintégration impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={`Réintégrer ${studentName}`} onClose={onClose} closeDisabled={busy}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">
          L'élève revient dans une classe. Son passage à l'école reste visible dans son parcours.
        </p>
        <div>
          <Label htmlFor="reint-classe">Classe</Label>
          <Select id="reint-classe" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Même classe qu'avant</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Enregistrement…" : "Réintégrer"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
        </div>
      </form>
    </Modal>
  );
}
