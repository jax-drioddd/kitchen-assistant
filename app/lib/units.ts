// app/lib/units.ts
//
// Deterministic unit conversion for combining inventory quantities across
// different units (e.g. "0.25 cup" + "2 tbsp" should merge into one row,
// not sit as two separate ones). This is exact arithmetic, not estimation
// — unlike food-quantity reasoning elsewhere in the app, unit conversion
// has no ambiguity, so a lookup table is the right tool here, not Claude.

// All volume units expressed in teaspoons (smallest common unit)
const VOLUME_IN_TSP: Record<string, number> = {
  tsp: 1,
  tbsp: 3,
  "fl oz": 6,
  cup: 48,
  pint: 96,
  quart: 192,
  gallon: 768,
  ml: 0.202884,
  l: 202.884,
};

// All weight units expressed in grams (smallest common unit)
const WEIGHT_IN_GRAMS: Record<string, number> = {
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
};

function normalize(unit: string): string {
  return unit.trim().toLowerCase();
}

function unitFamily(unit: string): "volume" | "weight" | null {
  const u = normalize(unit);
  if (u in VOLUME_IN_TSP) return "volume";
  if (u in WEIGHT_IN_GRAMS) return "weight";
  return null;
}

// Converts a quantity from one unit to another. Returns null if the units
// aren't in the same family (e.g. can't convert cups to grams without
// knowing the specific ingredient's density) or either unit is unknown
// (e.g. countable items with no unit — those just have to match exactly).
export function convertUnit(quantity: number, fromUnit: string, toUnit: string): number | null {
  const from = normalize(fromUnit);
  const to = normalize(toUnit);

  if (from === to) return quantity;

  const fromFamily = unitFamily(from);
  const toFamily = unitFamily(to);
  if (!fromFamily || !toFamily || fromFamily !== toFamily) return null;

  if (fromFamily === "volume") {
    return (quantity * VOLUME_IN_TSP[from]) / VOLUME_IN_TSP[to];
  }
  return (quantity * WEIGHT_IN_GRAMS[from]) / WEIGHT_IN_GRAMS[to];
}
