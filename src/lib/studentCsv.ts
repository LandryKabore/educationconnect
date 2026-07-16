/** Student import helpers (CSV + XLSX). UTF-8 CSV: comma or semicolon. */

import * as XLSX from "xlsx";

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

export function parseStudentXlsx(buffer: ArrayBuffer): StudentCsvParseResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  } catch {
    return { rows: [], errors: ["Fichier Excel illisible."] };
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], errors: ["Le fichier Excel ne contient aucune feuille."] };
  }

  const sheet = workbook.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(
    sheet,
    {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    },
  );

  if (!aoa.length) {
    return { rows: [], errors: ["Feuille Excel vide."] };
  }

  const allRows = aoa.map((row) => (row ?? []).map((c) => cellToString(c)));
  return parseStudentTable(allRows, 1);
}

export function isStudentImportFile(file: File): "csv" | "xlsx" | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "xlsx";
  if (name.endsWith(".csv") || file.type.includes("csv") || file.type === "text/plain") {
    return "csv";
  }
  if (
    file.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "application/vnd.ms-excel"
  ) {
    return "xlsx";
  }
  return null;
}

export async function parseStudentImportFile(
  file: File,
): Promise<StudentCsvParseResult> {
  const kind = isStudentImportFile(file);
  if (!kind) {
    return {
      rows: [],
      errors: ["Format non supporté. Utilisez un fichier .csv ou .xlsx."],
    };
  }
  if (kind === "xlsx") {
    return parseStudentXlsx(await file.arrayBuffer());
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

export function studentXlsxTemplateBlob(): Blob {
  const rows = [
    ["prenom", "nom", "classe", "telephone"],
    ["Awa", "Ouedraogo", "6eme A", "70123456"],
    ["Ibrahim", "Sawadogo", "6emeA", ""],
    ["Fatou", "Kaboré", "5eme B", "70234567"],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Eleves");
  const out = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
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
