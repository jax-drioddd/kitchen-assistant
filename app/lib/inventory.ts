// app/lib/inventory.ts
//
// Categorizes inventory items by food type for grouped display. Keyword
// matching, not AI — this needs to be instant when adding an item, and
// deterministic categorization doesn't need model reasoning to be reliable.
// Order matters: more specific phrases are checked before generic ones
// (e.g. "green bean" as produce before generic "bean" as pantry) to avoid
// misclassifying common overlaps.

export const CATEGORY_ORDER = [
  "Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Grains & Bread",
  "Pantry",
  "Frozen",
  "Beverages",
  "Other",
] as const;

const RULES: { category: (typeof CATEGORY_ORDER)[number]; keywords: string[] }[] = [
  {
    category: "Produce",
    keywords: [
      "green bean", "bell pepper", "green pepper", "red pepper",
      "lettuce", "spinach", "kale", "arugula", "tomato", "onion", "garlic",
      "carrot", "potato", "broccoli", "cauliflower", "cucumber", "zucchini",
      "squash", "mushroom", "cabbage", "celery", "corn", "pea", "avocado",
      "lemon", "lime", "apple", "banana", "orange", "berry", "grape",
      "cilantro", "parsley", "basil", "mint", "thyme", "rosemary", "dill",
      "scallion", "ginger", "asparagus", "eggplant", "beet", "radish",
    ],
  },
  {
    category: "Meat & Seafood",
    keywords: [
      "chicken", "beef", "pork", "turkey", "lamb", "sausage", "bacon",
      "ham", "salmon", "shrimp", "fish", "tuna", "cod", "steak", "tofu",
      "tempeh", "meat",
    ],
  },
  {
    category: "Dairy & Eggs",
    keywords: [
      "milk", "cheese", "yogurt", "butter", "cream", "egg", "mozzarella",
      "parmesan", "cheddar", "feta",
    ],
  },
  {
    category: "Grains & Bread",
    keywords: [
      "rice", "pasta", "noodle", "bread", "tortilla", "quinoa", "oats",
      "flour", "cereal", "couscous", "bun", "bagel",
    ],
  },
  {
    category: "Frozen",
    keywords: ["frozen", "ice cream"],
  },
  {
    category: "Beverages",
    keywords: ["juice", "soda", "coffee", "tea", "wine", "beer"],
  },
  {
    category: "Pantry",
    keywords: [
      "oil", "vinegar", "sauce", "spice", "salt", "pepper", "sugar",
      "honey", "broth", "stock", "paste", "mustard", "ketchup", "mayo",
      "cornstarch", "baking powder", "baking soda", "yeast", "nut", "seed",
      "chocolate", "jam", "syrup", "bean", "lentil", "chickpea",
    ],
  },
];

export function categorizeItem(itemName: string): (typeof CATEGORY_ORDER)[number] {
  const name = itemName.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((kw) => name.includes(kw))) {
      return rule.category;
    }
  }
  return "Other";
}
