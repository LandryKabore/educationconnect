import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CircleAlert, CircleCheck, CircleX, ShieldCheck } from "lucide-react";
import { verifyDocument, type VerifyResult } from "@/lib/documents";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button, Card, Input, Label } from "@/components/ui";

const DOC_LABEL: Record<string, string> = { bulletin: "Bulletin scolaire" };

function frDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm last:border-0 dark:border-slate-700">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900 dark:text-slate-100">{value}</dd>
    </div>
  );
}

/**
 * Public page opened by the QR code of a bulletin. No login. It only tells whether the document is
 * genuine: school, document, period, initials of the pupil and issue date. No grades, no full name.
 */
export default function VerifierDocument() {
  const [params, setParams] = useSearchParams();
  const urlCode = params.get("c") ?? "";
  const [code, setCode] = useState(urlCode);
  const [average, setAverage] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastKey = useRef("");

  const run = async (c: string, avg?: string) => {
    const clean = c.trim();
    if (!clean) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await verifyDocument(clean, avg));
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Vérification indisponible.");
    } finally {
      setLoading(false);
    }
  };

  // opened from the QR code: check straight away
  useEffect(() => {
    if (!urlCode || lastKey.current === urlCode) return;
    lastKey.current = urlCode;
    setCode(urlCode);
    void run(urlCode);
  }, [urlCode]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim() !== urlCode) setParams({ c: code.trim() }, { replace: true });
    lastKey.current = code.trim();
    void run(code, average);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 p-4 dark:from-[#243044] dark:to-[#1a2030]">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md">
        <div className="mb-4 text-center">
          <BrandLogo className="mx-auto h-16 w-auto max-w-[10rem] rounded-2xl" />
        </div>
        <h1 className="flex items-center justify-center gap-2 text-xl font-bold text-slate-900 dark:text-slate-100">
          <ShieldCheck className="h-5 w-5 text-brand-700" />
          Vérifier un document
        </h1>
        <p className="mt-1 text-center text-sm text-slate-500">
          Scannez le QR code d’un bulletin EduFaso, ou saisissez le code imprimé sur le document.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <div>
            <Label htmlFor="doc-code">Code du document</Label>
            <Input
              id="doc-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="EF-XXXXX-XXXXX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={20}
              required
            />
          </div>
          <div>
            <Label htmlFor="doc-moyenne">Moyenne générale imprimée (facultatif)</Label>
            <Input
              id="doc-moyenne"
              value={average}
              onChange={(e) => setAverage(e.target.value)}
              placeholder="ex. 12,45"
              inputMode="decimal"
              autoComplete="off"
              maxLength={6}
            />
            <p className="mt-1 text-xs text-slate-500">
              Permet de contrôler que la moyenne écrite sur le papier est bien celle enregistrée.
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={loading || !code.trim()}>
            {loading ? "Vérification…" : "Vérifier"}
          </Button>
        </form>

        <div className="mt-5" aria-live="polite">
          {error ? (
            <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <p>{error}</p>
            </div>
          ) : null}

          {result?.status === "unknown" ? (
            <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100">
              <CircleX className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Document introuvable</p>
                <p className="mt-1">
                  Ce code n’existe pas. Vérifiez la saisie. Si le code est bien celui du papier,
                  le document n’est pas authentique.
                </p>
              </div>
            </div>
          ) : null}

          {result?.status === "revoked" ? (
            <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100">
              <p className="flex items-center gap-2 font-semibold">
                <CircleX className="h-5 w-5 shrink-0" />
                Document annulé
              </p>
              <p>
                Ce document a été annulé par l’établissement ({result.school_name}). Il ne doit pas
                être accepté. Émis le {frDate(result.issued_on)}, annulé le{" "}
                {frDate(result.revoked_on)}.
              </p>
            </div>
          ) : null}

          {result?.status === "valid" ? (
            <div className="space-y-3">
              <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
                <CircleCheck className="mt-0.5 h-5 w-5 shrink-0" />
                <p className="font-semibold">Document authentique — émis par l’établissement</p>
              </div>
              <dl>
                <Row label="Établissement" value={result.school_name} />
                {result.school_city ? <Row label="Ville" value={result.school_city} /> : null}
                <Row label="Document" value={DOC_LABEL[result.doc_type] ?? result.doc_type} />
                <Row label="Période" value={result.period_label} />
                {result.year_label ? <Row label="Année scolaire" value={result.year_label} /> : null}
                <Row label="Élève (initiales)" value={result.holder_initials} />
                <Row label="Émis le" value={frDate(result.issued_on)} />
              </dl>
              {result.superseded ? (
                <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                  <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                  <p>
                    Une version plus récente de ce bulletin a été émise depuis (notes modifiées).
                    Ce papier est authentique mais peut être périmé : demandez la dernière version.
                  </p>
                </div>
              ) : null}
              {result.grade_check === "match" ? (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
                  La moyenne générale saisie correspond à celle enregistrée.
                </p>
              ) : null}
              {result.grade_check === "mismatch" ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100">
                  Attention : la moyenne générale saisie ne correspond PAS à celle enregistrée.
                  Le papier a peut-être été modifié.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <p className="mt-5 text-center text-xs text-slate-500">
          Cette page ne montre ni les notes, ni le nom complet de l’élève.
        </p>
      </Card>
    </div>
  );
}
