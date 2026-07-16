export const SCHOOL_TYPES = [
  { value: "primaire", label: "Primaire" },
  { value: "secondaire", label: "Secondaire" },
  { value: "mixte", label: "Primaire + Secondaire" },
  { value: "technique", label: "Technique / Professionnel" },
  { value: "autre", label: "Autre" },
] as const;

export type SchoolTypeValue = (typeof SCHOOL_TYPES)[number]["value"];

export function schoolTypeLabel(value: string | null | undefined) {
  if (!value) return "—";
  return SCHOOL_TYPES.find((t) => t.value === value)?.label ?? value;
}

export type SchoolFormFields = {
  name: string;
  code: string;
  schoolType: string;
  region: string;
  city: string;
  address: string;
  phone: string;
  email: string;
};

export const emptySchoolForm: SchoolFormFields = {
  name: "",
  code: "",
  schoolType: "",
  region: "",
  city: "",
  address: "",
  phone: "",
  email: "",
};

export function schoolToForm(school: {
  name: string;
  code: string | null;
  school_type: string | null;
  region: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}): SchoolFormFields {
  return {
    name: school.name ?? "",
    code: school.code ?? "",
    schoolType: school.school_type ?? "",
    region: school.region ?? "",
    city: school.city ?? "",
    address: school.address ?? "",
    phone: school.phone ?? "",
    email: school.email ?? "",
  };
}

export function formToSchoolPayload(form: SchoolFormFields) {
  return {
    name: form.name.trim(),
    code: form.code.trim(),
    school_type: form.schoolType,
    region: form.region.trim(),
    city: form.city.trim(),
    address: form.address.trim(),
    phone: form.phone.trim(),
    email: form.email.trim().toLowerCase(),
  };
}

export function isSchoolFormComplete(form: SchoolFormFields) {
  const p = formToSchoolPayload(form);
  return Boolean(
    p.name &&
      p.code &&
      p.school_type &&
      p.region &&
      p.city &&
      p.address &&
      p.phone &&
      p.email,
  );
}
