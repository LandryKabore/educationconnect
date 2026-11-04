import jsPDF from "jspdf";

export type FicheFamille = {
  parentName: string;
  children: string[];
  username: string;
  tempPassword: string;
};

/**
 * "Fiches famille": one cut-out card per parent (3 per A4 page) with the login and the temporary password,
 * and the names of the children they will see. Replaces the pile of one password sheet per pupil.
 */
export function generateFichesFamillePdf(opts: { schoolName: string; appUrl: string; fiches: FicheFamille[] }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const margin = 15;
  const cardH = 85;
  const perPage = 3;

  opts.fiches.forEach((f, i) => {
    if (i > 0 && i % perPage === 0) doc.addPage();
    const y = margin + (i % perPage) * (cardH + 5);
    doc.setDrawColor(150);
    doc.setLineDashPattern([2, 2], 0);
    doc.roundedRect(margin, y, W - 2 * margin, cardH, 3, 3);
    doc.setLineDashPattern([], 0);

    doc.setTextColor(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(opts.schoolName.slice(0, 60), margin + 6, y + 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text("Fiche famille — suivi de votre enfant sur EduFaso", margin + 6, y + 16);

    doc.setTextColor(30);
    doc.setFontSize(11);
    doc.text(`Parent : ${f.parentName}`, margin + 6, y + 27);
    const kids = f.children.length ? f.children.join(", ") : "—";
    const kidLines = doc.splitTextToSize(`Enfant(s) : ${kids}`, W - 2 * margin - 12) as string[];
    doc.text(kidLines.slice(0, 2), margin + 6, y + 34);

    doc.setFont("courier", "bold");
    doc.setFontSize(13);
    doc.text(`Identifiant : ${f.username}`, margin + 6, y + 50);
    doc.text(`Mot de passe temporaire : ${f.tempPassword}`, margin + 6, y + 58);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(`Adresse : ${opts.appUrl}`, margin + 6, y + 70);
    doc.text("Changez le mot de passe à la première connexion. Ne le partagez avec personne.", margin + 6, y + 76);
  });
  return doc;
}
