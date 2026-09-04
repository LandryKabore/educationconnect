import { describe, expect, it } from "vitest";
import {
  computeAnnualAverage,
  computeWeightedAverage,
  formatAverage,
  formatPassDecision,
  programmeToCoefMap,
  scoreOn20,
  type GradeWithSubject,
} from "@/lib/averages";

function grade(
  overrides: Partial<GradeWithSubject> & {
    subject_id: string;
    score: number;
    max_score: number;
    period_label: string;
  },
): GradeWithSubject {
  return {
    id: crypto.randomUUID(),
    student_id: "student-1",
    class_section_id: "class-1",
    comment: null,
    created_at: new Date().toISOString(),
    ...overrides,
  } as GradeWithSubject;
}

describe("scoreOn20", () => {
  it("scales a raw score to /20", () => {
    expect(scoreOn20(15, 20)).toBe(15);
    expect(scoreOn20(8, 10)).toBe(16);
    expect(scoreOn20(50, 100)).toBe(10);
  });

  it("returns 0 for an invalid or zero max score (never NaN/Infinity)", () => {
    expect(scoreOn20(10, 0)).toBe(0);
    expect(scoreOn20(10, -5)).toBe(0);
  });
});

describe("computeWeightedAverage", () => {
  it("weights each subject average by its coefficient", () => {
    const grades: GradeWithSubject[] = [
      grade({
        subject_id: "math",
        score: 16,
        max_score: 20,
        period_label: "Trimestre 1",
        matieres: { id: "math", school_id: "s", name: "Maths", code: null, coefficient: 4 },
      }),
      grade({
        subject_id: "fr",
        score: 10,
        max_score: 20,
        period_label: "Trimestre 1",
        matieres: { id: "fr", school_id: "s", name: "Français", code: null, coefficient: 2 },
      }),
    ];
    const result = computeWeightedAverage(grades);
    // (16*4 + 10*2) / (4+2) = 84/6 = 14
    expect(result.generalAverage).toBeCloseTo(14, 5);
    expect(result.subjects).toHaveLength(2);
  });

  it("averages multiple grades within the same subject before weighting", () => {
    const grades: GradeWithSubject[] = [
      grade({
        subject_id: "math",
        score: 10,
        max_score: 20,
        period_label: "Trimestre 1",
        matieres: { id: "math", school_id: "s", name: "Maths", code: null, coefficient: 1 },
      }),
      grade({
        subject_id: "math",
        score: 20,
        max_score: 20,
        period_label: "Trimestre 1",
        matieres: { id: "math", school_id: "s", name: "Maths", code: null, coefficient: 1 },
      }),
    ];
    const result = computeWeightedAverage(grades);
    expect(result.subjects[0].averageOn20).toBeCloseTo(15, 5); // (10+20)/2
  });

  it("excludes grades marked is_absent from the average", () => {
    const grades: GradeWithSubject[] = [
      grade({
        subject_id: "math",
        score: 20,
        max_score: 20,
        period_label: "Trimestre 1",
        matieres: { id: "math", school_id: "s", name: "Maths", code: null, coefficient: 1 },
      }),
      {
        ...grade({
          subject_id: "math",
          score: 0,
          max_score: 20,
          period_label: "Trimestre 1",
        }),
        is_absent: true,
      } as GradeWithSubject,
    ];
    const result = computeWeightedAverage(grades);
    expect(result.subjects[0].gradeCount).toBe(1);
    expect(result.subjects[0].averageOn20).toBe(20);
  });

  it("prefers the class-specific coefficient over the subject default", () => {
    const grades: GradeWithSubject[] = [
      grade({
        subject_id: "math",
        score: 10,
        max_score: 20,
        period_label: "Trimestre 1",
        matieres: { id: "math", school_id: "s", name: "Maths", code: null, coefficient: 1 },
      }),
    ];
    const result = computeWeightedAverage(grades, {
      coefficientBySubject: { math: 5 },
    });
    expect(result.subjects[0].coefficient).toBe(5);
  });

  it("returns a null general average with no grades (no divide-by-zero)", () => {
    const result = computeWeightedAverage([]);
    expect(result.generalAverage).toBeNull();
    expect(result.subjects).toHaveLength(0);
  });
});

describe("computeAnnualAverage / formatPassDecision", () => {
  it("averages only the trimesters that have grades", () => {
    const grades: GradeWithSubject[] = [
      grade({
        subject_id: "math",
        score: 12,
        max_score: 20,
        period_label: "Trimestre 1",
        matieres: { id: "math", school_id: "s", name: "Maths", code: null, coefficient: 1 },
      }),
      grade({
        subject_id: "math",
        score: 8,
        max_score: 20,
        period_label: "Trimestre 2",
        matieres: { id: "math", school_id: "s", name: "Maths", code: null, coefficient: 1 },
      }),
    ];
    const annual = computeAnnualAverage(grades);
    expect(annual.trimesterCount).toBe(2);
    expect(annual.complete).toBe(false); // Trimestre 3 missing
    expect(annual.annualAverage).toBeCloseTo(10, 5); // (12+8)/2
    expect(annual.passed).toBe(true);
    expect(formatPassDecision(annual)).toBe("En cours (≥ 10)");
  });

  it("marks a full year below 10 as failed, not just incomplete", () => {
    const grades: GradeWithSubject[] = ["Trimestre 1", "Trimestre 2", "Trimestre 3"].map(
      (period_label) =>
        grade({
          subject_id: "math",
          score: 5,
          max_score: 20,
          period_label,
          matieres: { id: "math", school_id: "s", name: "Maths", code: null, coefficient: 1 },
        }),
    );
    const annual = computeAnnualAverage(grades);
    expect(annual.complete).toBe(true);
    expect(annual.passed).toBe(false);
    expect(formatPassDecision(annual)).toBe("Ajourné");
  });

  it("has no decision yet when there are no grades at all", () => {
    const annual = computeAnnualAverage([]);
    expect(annual.passed).toBeNull();
    expect(formatPassDecision(annual)).toBe("—");
  });
});

describe("formatAverage", () => {
  it("formats to a fixed number of digits, dash for null/NaN", () => {
    expect(formatAverage(14.256, 2)).toBe("14.26");
    expect(formatAverage(null)).toBe("—");
    expect(formatAverage(Number.NaN)).toBe("—");
  });
});

describe("programmeToCoefMap", () => {
  it("keeps only positive coefficients with a subject id", () => {
    const map = programmeToCoefMap([
      { subject_id: "math", coefficient: 4 },
      { subject_id: "", coefficient: 3 },
      { subject_id: "art", coefficient: 0 },
    ]);
    expect(map).toEqual({ math: 4 });
  });
});
