"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import type { Recipe } from "@/types";

function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <Link href={`/recipes/${recipe.id}`}>
      <div className="bg-white rounded-2xl shadow-sm border border-amber-100 p-4 flex items-center gap-3 active:bg-amber-50 transition-colors">
        <div className="text-4xl">🎂</div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-800 truncate">{recipe.name}</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {recipe.ingredients.length} מרכיבים
            {recipe.prepTimeMin ? ` · ${recipe.prepTimeMin} דקות` : ""}
          </p>
        </div>
        <svg className="w-5 h-5 text-gray-400 rtl-flip shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}

export default function HomePage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/recipes")
      .then((r) => r.json())
      .then((data) => { setRecipes(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-amber-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-amber-100 px-4 py-4 flex items-center justify-between sticky top-0 z-40">
        <h1 className="text-xl font-bold text-amber-700">🎂 מתכוניית העוגות</h1>
        <Link
          href="/recipes/new"
          className="bg-amber-500 hover:bg-amber-600 text-white rounded-full w-10 h-10 flex items-center justify-center text-2xl font-light transition-colors shadow-sm"
          aria-label="הוסף מתכון"
        >
          +
        </Link>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
          </div>
        ) : recipes.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-6xl mb-4">🎂</div>
            <p className="text-lg font-medium text-gray-500">אין מתכונים עדיין</p>
            <p className="text-sm mt-1">לחץ על + כדי להוסיף מתכון ראשון</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {recipes.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
