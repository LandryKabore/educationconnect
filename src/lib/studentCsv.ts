/** Student import helpers (CSV only). UTF-8: comma or semicolon.
 *  Excel (.xlsx) support was removed because the npm `xlsx` package ships
 *  known high-severity CVEs with no fix on the public registry. Schools
 *  can still export their spreadsheet as CSV from Excel / LibreOffice. */

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

function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    return String(value);
  }
  return String(value).trim();
}

const DEFAULT_COLUMN_ORDER: (keyof Omit<StudentCsvRow, "line">)[] = [
  "firstName",
  "lastName",
  "className",
  "phone",
];

function rowHasMappedHeaders(cells: string[]): boolean {
  const mapped = cells.map((h) => HEADER_MAP[normalizeHeader(h)] ?? null);
  return mapped.includes("firstName") && mapped.includes("lastName");
}

function isRowEmpty(cells: string[]): boolean {
  return cells.every((c) => !String(c ?? "").trim());
}

/** Shared parser. Supports a header row, or headerless files (prenom | nom | classe | tel). */
export function parseStudentTable(
  allRows: string[][],
  firstSheetLine = 1,
): StudentCsvParseResult {
  const nonEmpty = allRows
    .map((cells, idx) => ({ cells, line: firstSheetLine + idx }))
    .filter(({ cells }) => !isRowEmpty(cells));

  if (nonEmpty.length === 0) {
    return { rows: [], errors: ["Fichier vide ou sans données."] };
  }

  const first = nonEmpty[0];
  const hasHeaders = rowHasMappedHeaders(first.cells);

  let mapped: (keyof Omit<StudentCsvRow, "line"> | null)[];
  let data: { cells: string[]; line: number }[];

  if (hasHeaders) {
    mapped = first.cells.map((h) => HEADER_MAP[normalizeHeader(h)] ?? null);
    data = nonEmpty.slice(1);
  } else {
    // No header row — assume A=prenom, B=nom, C=classe, D=telephone
    const width = Math.max(
      ...nonEmpty.map(({ cells }) => cells.length),
      DEFAULT_COLUMN_ORDER.length,
    );
    mapped = Array.from({ length: width }, (_, i) => DEFAULT_COLUMN_ORDER[i] ?? null);
    data = nonEmpty;
  }

  if (!mapped.includes("firstName") || !mapped.includes("lastName")) {
    return {
      rows: [],
      errors: [
        "Colonnes obligatoires manquantes : prenom et nom (ou first_name / last_name). Sans en-tête, mettez prénom en colonne A et nom en colonne B.",
      ],
    };
  }

  const rows: StudentCsvRow[] = [];
  const errors: string[] = [];

  for (const { cells, line } of data) {
    const row: StudentCsvRow = {
      line,
      firstName: "",
      lastName: "",
      className: "",
      phone: "",
    };
    mapped.forEach((key, idx) => {
      if (!key) return;
      row[key] = cellToString(cells[idx]);
    });

    if (!row.firstName || !row.lastName) {
      errors.push(`Ligne ${row.line} : prénom et nom requis.`);
      continue;
    }
    rows.push(row);
  }

  if (rows.length === 0 && errors.length === 0) {
    return {
      rows: [],
      errors: ["Aucune ligne de données trouvée."],
    };
  }

  return { rows, errors };
}

export function parseStudentCsv(text: string): StudentCsvParseResult {
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  if (!cleaned) {
    return { rows: [], errors: ["Fichier vide."] };
  }

  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 1) {
    return { rows: [], errors: ["Fichier vide."] };
  }

  const delimiter = detectDelimiter(lines[0]);
  const allRows = lines.map((line) => splitCsvLine(line, delimiter));
  return parseStudentTable(allRows, 1);
}

export function isStudentImportFile(file: File): "csv" | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type.includes("csv") || file.type === "text/plain") {
    return "csv";
  }
  // Explicitly reject Excel so the UI can show a clear message rather than
  // a cryptic parse error (xlsx support was removed for security reasons).
  if (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "application/vnd.ms-excel"
  ) {
    return null;
  }
  return null;
}

export async function parseStudentImportFile(
  file: File,
): Promise<StudentCsvParseResult> {
  const kind = isStudentImportFile(file);
  if (!kind) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      return {
        rows: [],
        errors: [
          "Les fichiers Excel (.xlsx) ne sont plus acceptés pour des raisons de sécurité. Ouvrez le fichier dans Excel / LibreOffice et enregistrez-le en CSV (UTF-8), puis réimportez.",
        ],
      };
    }
    return {
      rows: [],
      errors: ["Format non supporté. Utilisez un fichier .csv (UTF-8)."],
    };
  }
  return parseStudentCsv(await file.text());
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

export function downloadTextFile(
  filename: string,
  content: string,
  mime = "text/csv;charset=utf-8",
) {
  const blob = new Blob(["\uFEFF" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function credentialsToCsv(
  rows: {
    firstName: string;
    lastName: string;
    className: string;
    username: string;
    tempPassword: string;
  }[],
) {
  const header = "prenom,nom,classe,identifiant,mot_de_passe";
  const body = rows.map((r) =>
    [r.firstName, r.lastName, r.className, r.username, r.tempPassword]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header, ...body].join("\n");
}
