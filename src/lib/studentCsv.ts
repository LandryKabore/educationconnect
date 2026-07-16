/** CSV helpers for student import (UTF-8, comma or semicolon). */

export type StudentCsvRow = {
  line: number;
  firstName: string;
  lastName: string;
  className: string;
  phone: string;
};

export type StudentCsvParseResult = {
  rows: StudentCsvRow[];
  errors: string[];
};

const HEADER_MAP: Record<string, keyof Omit<StudentCsvRow, "line">> = {
  prenom: "firstName",
  prénom: "firstName",
  firstname: "firstName",
  first_name: "firstName",
  nom: "lastName",
  lastname: "lastName",
  last_name: "lastName",
  classe: "className",
  class: "className",
  class_name: "className",
  telephone: "phone",
  téléphone: "phone",
  phone: "phone",
  tel: "phone",
};

function detectDelimiter(headerLine: string): "," | ";" {
  const commas = (headerLine.match(/,/g) ?? []).length;
  const semis = (headerLine.match(/;/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

function splitCsvLine(line: string, delimiter: "," | ";"): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function normalizeHeader(h: string) {
  return h
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function parseStudentCsv(text: string): StudentCsvParseResult {
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  if (!cleaned) {
    return { rows: [], errors: ["Fichier vide."] };
  }

  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return {
      rows: [],
      errors: ["Le fichier doit contenir une ligne d’en-tête et au moins une ligne de données."],
    };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter).map(normalizeHeader);
  const mapped = headers.map((h) => HEADER_MAP[h] ?? null);

  if (!mapped.includes("firstName") || !mapped.includes("lastName")) {
    return {
      rows: [],
      errors: [
        "Colonnes obligatoires manquantes : prenom et nom (ou first_name / last_name).",
      ],
    };
  }

  const rows: StudentCsvRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delimiter);
    const row: StudentCsvRow = {
      line: i + 1,
      firstName: "",
      lastName: "",
      className: "",
      phone: "",
    };
    mapped.forEach((key, idx) => {
      if (!key) return;
      row[key] = (cells[idx] ?? "").trim();
    });

    if (!row.firstName || !row.lastName) {
      errors.push(`Ligne ${row.line} : prénom et nom requis.`);
      continue;
    }
    rows.push(row);
  }

  return { rows, errors };
}

export function studentCsvTemplate(): string {
  return [
    "prenom,nom,classe,telephone",
    "Awa,Ouedraogo,6eme A,70123456",
    "Ibrahim,Sawadogo,6emeA",
    "Fatou,Kaboré,5eme B,70234567",
  ].join("\n");
}

/** Match class names ignoring accents, case, and spaces (6emeA ≈ 6ème A). */
export function normalizeClassKey(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["\uFEFF" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function credentialsToCsv(
  rows: { firstName: string; lastName: string; className: string; username: string; tempPassword: string }[],
) {
  const header = "prenom,nom,classe,identifiant,mot_de_passe";
  const body = rows.map((r) =>
    [r.firstName, r.lastName, r.className, r.username, r.tempPassword]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header, ...body].join("\n");
}
