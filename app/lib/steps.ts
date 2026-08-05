// app/lib/steps.ts
//
// Normalizes recipe instructions into a consistent step shape, regardless
// of whether they came from before or after the cooking-mode update.
// Older meals in the database have instructions as plain strings; new ones
// are structured objects with title/content/timer_seconds. This lets every
// component render either format without special-casing.

export interface RecipeStep {
  title: string;
  content: string;
  timer_seconds: number | null;
}

export function normalizeSteps(instructions: any[] | undefined | null): RecipeStep[] {
  if (!instructions) return [];
  return instructions.map((step, i) => {
    if (typeof step === "string") {
      return { title: `Step ${i + 1}`, content: step, timer_seconds: null };
    }
    return {
      title: step?.title ?? `Step ${i + 1}`,
      content: step?.content ?? "",
      timer_seconds: step?.timer_seconds ?? null,
    };
  });
}
