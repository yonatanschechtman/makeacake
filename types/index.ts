export interface RecipeIngredient {
  id: number;
  recipeId: number;
  name: string;
  quantity: number;
  unit: string;
  notes?: string | null;
}

export interface Recipe {
  id: number;
  name: string;
  sourceType: string;
  sourceUrl?: string | null;
  instructions?: string | null;
  servingSize: number;
  prepTimeMin?: number | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  ingredients: RecipeIngredient[];
}

export interface IngredientPrice {
  id: number;
  ingredientName: string;
  pricePerUnit: number;
  unit: string;
  packageInfo?: string | null;
  supermarket?: string | null;
  lastUpdated: string;
}

export interface Setting {
  id: number;
  key: string;
  label: string;
  value: number;
  unit: string;
  category: string;
  isHourly: boolean;
}
