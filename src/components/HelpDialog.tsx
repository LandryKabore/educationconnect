import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { APP_VERSION, platformLabel } from "@/lib/appInfo";
import { recentClientErrors } from "@/lib/errorBuffer";
import type { AppRole } from "@/lib/types";
import { Modal } from "@/components/Modal";
import { Button, Label, Textarea } from "@/components/ui";

const TIPS: Record<AppRole, { q: string; a: string }[]> = {
  student: [
    { q: "Où voir mes notes ?", a: "Menu « Mes notes ». Les notes sont classées par trimestre, avec la moyenne annuelle en haut." },
    { q: "Comment télécharger mon bulletin ?", a: "Menu « Mon bulletin », choisissez le trimestre puis « Télécharger ». Un QR code permet de vérifier qu’il est authentique." },
    { q: "Je ne vois pas une note.", a: "La note apparaît quand l’enseignant l’a enregistrée. Si elle manque longtemps, signalez-le ci-dessous." },
  ],
  parent: [
    { q: "Comment voir les notes de mon enfant ?", a: "Menu « Enfants », choisissez l’enfant puis « Notes » ou « Bulletin »." },
    { q: "Comment vérifier un bulletin papier ?", a: "Scannez le QR code en bas du bulletin avec votre téléphone : la page indique si le document est authentique." },
    { q: "Je ne vois pas mon enfant.", a: "Le lien parent–enfant est créé par l’école. Contactez l’administration, ou signalez-le ci-dessous." },
  ],
  teacher: [
    { q: "Comment saisir des notes ?", a: "Menu « Devoirs & évaluations », choisissez la classe et la matière, créez l’évaluation puis « Noter »." },
    { q: "Je ne peux plus modifier une note.", a: "La période est probablement clôturée. Demandez à l’administration de la rouvrir." },
    { q: "Qui a changé une note ?", a: "Sur la page de l’évaluation, le bouton « Historique » montre chaque modification." },
  ],
  school_admin: [
    { q: "Comment clôturer un trimestre ?", a: "Menu « Périodes et clôture » : bouton « Clôturer ». Les notes sont alors verrouillées ; « Rouvrir » demande une raison." },
    { q: "Comment générer les bulletins ?", a: "Menu « Bulletins » : un élève, ou toute une classe en fichier ZIP. Chaque bulletin porte un QR code de vérification." },
    { q: "Un parent doute d’un bulletin.", a: "Il scanne le QR code (page publique). Vous pouvez annuler un bulletin émis par erreur dans « Bulletins »." },
  ],
  super_admin: [
    { q: "Où voir les problèmes signalés ?", a: "Menu « Signalements » : les messages envoyés par les utilisateurs, avec la page, le rôle et la version de l’application." },
    { q: "Comment aider une école ?", a: "Écoles → l’école → mode support." },
  ],
};

/** Help + « Signaler un problème » form. The page, role, version and online state are sent automatically. */
export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { role, user } = useAuth();
  const location = useLocation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"aide" | "signaler">("aide");
  const [message, setMessage] = useState("");
  const [withErrors, setWithErrors] = useState(true);
  const [sending, setSending] = useState(false);

  const tips = role ? TIPS[role] : [];
  const errors = recentClientErrors();
  const online = typeof navigator === "undefined" ? null : navigator.onLine;

  const send = async () => {
    const text = message.trim();
    if (text.length < 5) {
      toast.error("Décrivez le problème en quelques mots (5 caractères minimum)");
      return;
    }
    if (!user) return;
    setSending(true);
    const { error } = await supabase.from("signalements").insert({
      message: text,
      route: location.pathname.slice(0, 300),
      app_version: APP_VERSION.slice(0, 40),
      platform: platformLabel(),
      online,
      user_agent: navigator.userAgent.slice(0, 400),
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      error_messages: withErrors ? errors.map((e) => e.message) : [],
    });
    setSending(false);
    if (error) {
      toast.error(error.message || "Envoi impossible. Réessayez plus tard.");
      return;
    }
    toast.success("Merci, votre signalement a été envoyé");
    setMessage("");
    void qc.invalidateQueries({ queryKey: ["signalements"] });
    onClose();
  };

  return (
    <Modal open={open} title="Aide" onClose={onClose} closeDisabled={sending} size="lg">
      <div className="mb-4 flex gap-2 border-b border-slate-200 dark:border-slate-700">
        {(
          [
            ["aide", "Questions fréquentes"],
            ["signaler", "Signaler un problème"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium " +
              (tab === key
                ? "border-brand-700 text-brand-800 dark:text-brand-300"
                : "border-transparent text-slate-500 hover:text-slate-800")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "aide" ? (
        <div className="space-y-3 text-sm">
          {tips.map((t) => (
            <div key={t.q} className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
              <p className="font-semibold text-slate-900 dark:text-slate-100">{t.q}</p>
              <p className="mt-1 text-slate-600 dark:text-slate-300">{t.a}</p>
            </div>
          ))}
          <p className="text-slate-600 dark:text-slate-300">
            Vous n’avez pas trouvé la réponse ?{" "}
            <button type="button" className="font-medium text-brand-700 underline" onClick={() => setTab("signaler")}>
              Signaler un problème
            </button>
          </p>
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <div>
            <Label htmlFor="signal-message">Que s’est-il passé ?</Label>
            <Textarea
              id="signal-message"
              className="min-h-28"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              placeholder="Ex. : la page des notes ne s’ouvre pas, j’ai un message d’erreur…"
            />
            <p className="mt-1 text-right text-xs text-slate-500">{message.length} / 2000</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
            <p className="mb-1 font-semibold text-slate-800 dark:text-slate-100">Envoyé automatiquement avec votre message</p>
            <ul className="space-y-0.5">
              <li>Page : {location.pathname}</li>
              <li>Votre rôle et votre école (ajoutés par le serveur)</li>
              <li>
                Version de l’application : {APP_VERSION} · {platformLabel()} ·{" "}
                {online === null ? "connexion inconnue" : online ? "en ligne" : "hors ligne"}
              </li>
            </ul>
            {errors.length > 0 ? (
              <label className="mt-2 flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={withErrors}
                  onChange={(e) => setWithErrors(e.target.checked)}
                />
                <span>
                  Joindre les {errors.length} dernier{errors.length > 1 ? "s" : ""} message{errors.length > 1 ? "s" : ""}{" "}
                  d’erreur technique{errors.length > 1 ? "s" : ""} de cette session
                </span>
              </label>
            ) : null}
          </div>

          <div className="flex gap-2">
            <Button onClick={() => void send()} disabled={sending || message.trim().length < 5}>
              <Send className="h-4 w-4" />
              {sending ? "Envoi…" : "Envoyer"}
            </Button>
            <Button variant="ghost" onClick={onClose} disabled={sending}>
              Annuler
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

