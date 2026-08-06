// app/lib/steps.ts
//
// Normalizes recipe steps and handles servings scaling. Step content can
// reference ingredients by id using {0001}-style placeholders, so the same
// step text stays accurate whether you're cooking for 2 or scaled to 6 —
// the placeholder gets substituted with the current scaled amount at
// render time, not baked in as a literal number.

export interface Ingredient {
  id?: string;
  name: string;
  quantity: number;
  unit: string;
}

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

// Formats a scaled quantity nicely — common fractions read better than
// raw decimals in a recipe (e.g. "1/2 cup" not "0.5 cup").
export function formatQuantity(qty: number): string {
  const rounded = Math.round(qty * 100) / 100;
  const whole = Math.floor(rounded);
  const frac = Math.round((rounded - whole) * 100) / 100;

  const fractionMap: Record<number, string> = {
    0.25: "¼", 0.33: "⅓", 0.5: "½", 0.67: "⅔", 0.75: "¾",
  };

  const nearestFrac = Object.keys(fractionMap)
    .map(Number)
    .find((f) => Math.abs(f - frac) < 0.05);

  if (nearestFrac !== undefined) {
    return whole > 0 ? `${whole}${fractionMap[nearestFrac]}` : fractionMap[nearestFrac];
  }
  if (rounded === Math.floor(rounded)) return `${rounded}`;
  return `${rounded}`;
}

export function scaleQuantity(
  quantity: number,
  baseServings: number,
  currentServings: number
): number {
  if (!baseServings || baseServings <= 0) return quantity;
  return quantity * (currentServings / baseServings);
}

export function scaleIngredients(
  ingredients: Ingredient[],
  baseServings: number,
  currentServings: number
): Ingredient[] {
  return ingredients.map((ing) => ({
    ...ing,
    quantity: scaleQuantity(ing.quantity, baseServings, currentServings),
  }));
}

// Replaces {id} placeholders in step content with the current scaled
// amount for that ingredient. Content without placeholders (legacy steps
// from before this feature) passes through unchanged.
export function renderStepContent(
  content: string,
  ingredients: Ingredient[],
  baseServings: number,
  currentServings: number
): string {
  return content.replace(/\{([a-zA-Z0-9_-]+)\}/g, (match, id) => {
    const ing = ingredients.find((i) => i.id === id);
    if (!ing) return match; // unknown id — leave the placeholder visible rather than silently dropping it
    const scaledQty = scaleQuantity(ing.quantity, baseServings, currentServings);
    const qtyStr = formatQuantity(scaledQty);
    return ing.unit ? `${qtyStr} ${ing.unit} ${ing.name}` : `${qtyStr} ${ing.name}`;
  });
}
