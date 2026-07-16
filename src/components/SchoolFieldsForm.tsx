import type { SchoolFormFields } from "@/lib/schoolForm";
import { SCHOOL_TYPES } from "@/lib/schoolForm";
import { Input, Label, Select, Textarea } from "@/components/ui";

type Props = {
  form: SchoolFormFields;
  onChange: (key: keyof SchoolFormFields, value: string) => void;
  idPrefix?: string;
};

export function SchoolFieldsForm({ form, onChange, idPrefix = "school" }: Props) {
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label htmlFor={id("name")}>Nom de l’établissement</Label>
        <Input
          id={id("name")}
          value={form.name}
          onChange={(e) => onChange("name", e.target.value)}
          placeholder="ex. Lycée Privé Saint-Joseph"
          required
        />
      </div>
      <div>
        <Label htmlFor={id("code")}>Code école</Label>
        <Input
          id={id("code")}
          value={form.code}
          onChange={(e) => onChange("code", e.target.value)}
          placeholder="ex. LP-SJ-OUA"
          required
        />
      </div>
      <div>
        <Label htmlFor={id("schoolType")}>Type d’établissement</Label>
        <Select
          id={id("schoolType")}
          value={form.schoolType}
          onChange={(e) => onChange("schoolType", e.target.value)}
          required
        >
          <option value="">Sélectionner…</option>
          {SCHOOL_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor={id("region")}>Région / province</Label>
        <Input
          id={id("region")}
          value={form.region}
          onChange={(e) => onChange("region", e.target.value)}
          placeholder="ex. Centre"
          required
        />
      </div>
      <div>
        <Label htmlFor={id("city")}>Ville / commune</Label>
        <Input
          id={id("city")}
          value={form.city}
          onChange={(e) => onChange("city", e.target.value)}
          placeholder="ex. Ouagadougou"
          required
        />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor={id("address")}>Adresse complète</Label>
        <Textarea
          id={id("address")}
          value={form.address}
          onChange={(e) => onChange("address", e.target.value)}
          placeholder="Quartier, rue, repère…"
          required
        />
      </div>
      <div>
        <Label htmlFor={id("phone")}>Téléphone</Label>
        <Input
          id={id("phone")}
          type="tel"
          value={form.phone}
          onChange={(e) => onChange("phone", e.target.value)}
          placeholder="ex. +226 70 00 00 00"
          required
        />
      </div>
      <div>
        <Label htmlFor={id("email")}>E-mail de contact</Label>
        <Input
          id={id("email")}
          type="email"
          value={form.email}
          onChange={(e) => onChange("email", e.target.value)}
          placeholder="ex. contact@ecole.bf"
          required
        />
      </div>
    </div>
  );
}
