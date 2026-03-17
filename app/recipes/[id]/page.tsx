"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import type { Recipe, IngredientPrice, Setting } from "@/types";

function formatCurrency(n: number) {
  return `₪${n.toFixed(2)}`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "לפני פחות משעה";
  if (hours < 24) return `לפני ${hours} שעות`;
  return `לפני ${Math.floor(hours / 24)} ימים`;
}

export default function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [prices, setPrices] = useState<Record<string, IngredientPrice>>({});
  const [settings, setSettings] = useState<Setting[]>([]);
  const [multiplier, setMultiplier] = useState(1);
  const [prepTime, setPrepTime] = useState<number>(0);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [pricesLastUpdated, setPricesLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/recipes/${id}`).then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]).then(([recipeData, settingsData]) => {
      setRecipe(recipeData);
      setPrepTime(recipeData.prepTimeMin ?? 0);
      setSettings(settingsData);
      setLoading(false);
      // Auto-fetch prices on load
      fetchPrices(recipeData.ingredients.map((i: { name: string }) => i.name));
    }).catch(() => setLoading(false));
  }, [id]);

  async function fetchPrices(ingredientNames: string[]) {
    setLoadingPrices(true);
    try {
      const res = await fetch("/api/prices/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredientNames }),
      });
      const data: IngredientPrice[] = await res.json();
      const map: Record<string, IngredientPrice> = {};
      for (const p of data) map[p.ingredientName] = p;
      setPrices(map);
      if (data.length > 0) {
        const latest = data.reduce((a, b) =>
          new Date(a.lastUpdated) > new Date(b.lastUpdated) ? a : b
        );
        setPricesLastUpdated(latest.lastUpdated);
      }
    } catch (err) {
      console.error("Failed to fetch prices", err);
    } finally {
      setLoadingPrices(false);
    }
  }

  async function handleSavePrepTime() {
    if (!recipe) return;
    await fetch(`/api/recipes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...recipe, prepTimeMin: prepTime }),
    });
    setRecipe({ ...recipe, prepTimeMin: prepTime });
  }

  async function handleDelete() {
    if (!confirm("האם למחוק את המתכון?")) return;
    setDeleting(true);
    await fetch(`/api/recipes/${id}`, { method: "DELETE" });
    router.push("/");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="min-h-screen bg-amber-50 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500">מתכון לא נמצא</p>
        <button onClick={() => router.push("/")} className="text-amber-600 font-medium">
          חזרה לרשימה
        </button>
      </div>
    );
  }

  // Cost calculation
  const prepHours = prepTime / 60;
  let ingredientCost = 0;
  for (const ing of recipe.ingredients) {
    const price = prices[ing.name];
    if (price) {
      ingredientCost += ing.quantity * multiplier * price.pricePerUnit;
    }
  }

  let laborCost = 0;
  let infraCost = 0;
  let fixedCost = 0;

  for (const s of settings) {
    if (s.isHourly) {
      if (s.category === "labor") laborCost += prepHours * s.value;
      else infraCost += prepHours * s.value;
    } else {
      fixedCost += s.value * multiplier;
    }
  }

  const totalCost = ingredientCost + laborCost + infraCost + fixedCost;

  const missingPrices = recipe.ingredients.filter((i) => !prices[i.name]);

  return (
    <div className="min-h-screen bg-amber-50 pb-24">
      {/* Header */}
      <header className="bg-white border-b border-amber-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-40">
        <button onClick={() => router.push("/")} className="text-gray-500 hover:text-gray-700 p-1">
          <svg className="w-6 h-6 rtl-flip" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-amber-700 flex-1 truncate">{recipe.name}</h1>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-red-400 hover:text-red-600 p-1 disabled:opacity-50"
        >
          🗑️
        </button>
      </header>

      <div className="px-4 py-4 max-w-lg mx-auto space-y-4">
        {/* Quantity multiplier */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-amber-100">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-700">כמות עוגות</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMultiplier(Math.max(0.25, multiplier - 0.25))}
                className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 font-bold text-lg flex items-center justify-center hover:bg-amber-200"
              >
                −
              </button>
              <span className="text-lg font-bold text-amber-700 w-10 text-center">{multiplier}</span>
              <button
                onClick={() => setMultiplier(multiplier + 0.25)}
                className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 font-bold text-lg flex items-center justify-center hover:bg-amber-200"
              >
                +
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1">בסיס: {recipe.servingSize} יח&#39;</p>
        </div>

        {/* Prep time */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-amber-100">
          <div className="flex items-center justify-between gap-3">
            <label className="font-semibold text-gray-700 shrink-0">זמן הכנה</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={prepTime}
                onChange={(e) => setPrepTime(parseInt(e.target.value) || 0)}
                onBlur={handleSavePrepTime}
                className="w-20 border border-gray-200 rounded-xl px-3 py-2 text-center text-sm focus:outline-none focus:border-amber-400"
              />
              <span className="text-sm text-gray-500">דקות</span>
            </div>
          </div>
        </div>

        {/* Ingredients + prices */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-amber-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-700">מרכיבים</h2>
            <button
              onClick={() => fetchPrices(recipe.ingredients.map((i) => i.name))}
              disabled={loadingPrices}
              className="text-xs text-amber-600 hover:text-amber-800 flex items-center gap-1 disabled:opacity-50"
            >
              {loadingPrices ? (
                <span className="inline-block w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                "🔄"
              )}
              רענן מחירים
            </button>
          </div>

          {pricesLastUpdated && (
            <p className="text-xs text-gray-400 mb-3">עודכן {timeAgo(pricesLastUpdated)}</p>
          )}

          <div className="space-y-0">
            {recipe.ingredients.map((ing) => {
              const price = prices[ing.name];
              const qty = ing.quantity * multiplier;
              const cost = price ? qty * price.pricePerUnit : null;

              return (
                <div key={ing.id} className="flex items-center py-2.5 border-b border-gray-50 last:border-0 gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{ing.name}</p>
                    {price && (
                      <p className="text-xs text-gray-400">
                        {formatCurrency(price.pricePerUnit)}/{price.unit}
                      </p>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 shrink-0">
                    {qty % 1 === 0 ? qty : qty.toFixed(2)} {ing.unit}
                  </div>
                  <div className="text-sm font-semibold text-amber-700 w-16 text-left shrink-0">
                    {cost !== null ? formatCurrency(cost) : (
                      <span className="text-gray-300 text-xs">אין מחיר</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {missingPrices.length > 0 && (
            <p className="text-xs text-gray-400 mt-3">
              {missingPrices.length} מרכיבים ללא מחיר. לחץ &#34;רענן מחירים&#34; לעדכון.
            </p>
          )}
        </div>

        {/* Cost breakdown */}
        <div className="bg-amber-600 rounded-2xl p-4 shadow-sm text-white">
          <h2 className="font-semibold mb-3">פירוט עלויות</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="opacity-80">מרכיבים</span>
              <span className="font-medium">{formatCurrency(ingredientCost)}</span>
            </div>
            {laborCost > 0 && (
              <div className="flex justify-between">
                <span className="opacity-80">עלות עבודה ({prepTime} דק&#39;)</span>
                <span className="font-medium">{formatCurrency(laborCost)}</span>
              </div>
            )}
            {infraCost > 0 && (
              <div className="flex justify-between">
                <span className="opacity-80">תשתיות (חשמל/מים)</span>
                <span className="font-medium">{formatCurrency(infraCost)}</span>
              </div>
            )}
            {fixedCost > 0 && (
              <div className="flex justify-between">
                <span className="opacity-80">עלויות קבועות</span>
                <span className="font-medium">{formatCurrency(fixedCost)}</span>
              </div>
            )}
            <div className="border-t border-amber-500 pt-2 flex justify-between text-base font-bold">
              <span>סה&#34;כ</span>
              <span>{formatCurrency(totalCost)}</span>
            </div>
          </div>
        </div>

        {/* Instructions */}
        {recipe.instructions && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-amber-100">
            <h2 className="font-semibold text-gray-700 mb-2">הוראות הכנה</h2>
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{recipe.instructions}</p>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
