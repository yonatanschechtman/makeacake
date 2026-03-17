"use client";

import { useEffect, useState } from "react";
import BottomNav from "@/components/BottomNav";
import type { IngredientPrice } from "@/types";

const PACKAGE_UNITS = ["גרם", 'ק"ג', 'מ"ל', "ליטר", "יחידה"];

function formatPrice(n: number | null | undefined, unit?: string) {
  if (n == null || n === 0) return "—";
  return `₪${n.toFixed(3)}/${unit ?? "יח׳"}`;
}

// Group-effective price: manual wins, then highest auto among same-unit members
function computeGroupPrice(
  canonical: IngredientPrice,
  aliases: IngredientPrice[]
): { price: number; isManual: boolean } {
  const members = [canonical, ...aliases].filter((m) => m.unit === canonical.unit);
  const manualPrices = members.filter((m) => m.userPrice != null).map((m) => m.userPrice as number);
  if (manualPrices.length > 0) return { price: Math.max(...manualPrices), isManual: true };
  const autoPrices = members.map((m) => m.pricePerUnit);
  return { price: Math.max(...autoPrices), isManual: false };
}

interface GroupSuggestion {
  canonical: string;
  aliases: string[];
  confidence: "high" | "medium" | "low";
  reasoning: string;
  canonicalInDb: boolean;
}

interface PriceGroup {
  canonical: IngredientPrice;
  aliases: IngredientPrice[];
}

interface EditForm {
  packagePrice: string;
  packageSize: string;
  packageUnit: string;
  density: string;
}

export default function IngredientsPage() {
  const [prices, setPrices] = useState<IngredientPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [form, setForm] = useState<EditForm>({
    packagePrice: "",
    packageSize: "",
    packageUnit: "גרם",
    density: "",
  });
  const [saving, setSaving] = useState(false);


  // "Add alias" dropdown per expanded group
  const [addAliasValue, setAddAliasValue] = useState("");

  // Bulk density population
  const [populatingDensities, setPopulatingDensities] = useState(false);

  // Grouping suggestion state
  const [suggesting, setSuggesting] = useState(false);
  const [groups, setGroups] = useState<GroupSuggestion[]>([]);
  const [checkedGroups, setCheckedGroups] = useState<Set<number>>(new Set());
  const [applyingGroups, setApplyingGroups] = useState(false);

  useEffect(() => {
    fetch("/api/ingredients", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        setPrices(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Treat self-referential aliasOf (aliasOf === own name) as null
  const effectiveAliasOf = (p: IngredientPrice) =>
    p.aliasOf === p.ingredientName ? null : p.aliasOf;

  // Build groups: each canonical with its aliases.
  // Orphaned aliases (aliasOf points to a name not present in prices) are shown as standalone entries.
  const canonicalNameSet = new Set(prices.filter((p) => !effectiveAliasOf(p)).map((p) => p.ingredientName));
  const allGroups: PriceGroup[] = [
    ...prices
      .filter((p) => !effectiveAliasOf(p))
      .map((canonical) => ({
        canonical,
        aliases: prices.filter((p) => effectiveAliasOf(p) === canonical.ingredientName),
      })),
    // Orphaned aliases — show them so nothing is hidden
    ...prices
      .filter((p) => effectiveAliasOf(p) && !canonicalNameSet.has(effectiveAliasOf(p)!))
      .map((orphan) => ({ canonical: orphan, aliases: [] as IngredientPrice[] })),
  ];
  const groupedItems = allGroups.filter((g) => g.aliases.length > 0);
  const standaloneItems = allGroups.filter((g) => g.aliases.length === 0);

  // Ingredients that can be added as aliases (no aliasOf, no aliases pointing to them)
  function addableAliases(canonical: IngredientPrice): IngredientPrice[] {
    return prices.filter(
      (p) =>
        !p.aliasOf &&
        p.id !== canonical.id &&
        !prices.some((other) => other.aliasOf === p.ingredientName)
    );
  }

  async function handleRefreshAuto() {
    if (prices.length === 0) return;
    setRefreshing(true);
    try {
      const names = prices.map((p) => p.ingredientName);
      const res = await fetch("/api/prices/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredientNames: names }),
      });
      const updated: IngredientPrice[] = await res.json();
      const map: Record<string, IngredientPrice> = {};
      for (const p of updated) map[p.ingredientName] = p;
      setPrices((prev) => prev.map((p) => map[p.ingredientName] ?? p));
    } finally {
      setRefreshing(false);
    }
  }


  function openEdit(price: IngredientPrice) {
    if (expandedId === price.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(price.id);
    setAddAliasValue("");
    setForm({
      packagePrice: price.userPackagePrice != null ? String(price.userPackagePrice) : "",
      packageSize: price.userPackageSize != null ? String(price.userPackageSize) : "",
      packageUnit: price.userPackageUnit ?? "גרם",
      density: price.density != null ? String(price.density) : "",
    });

  }

  async function handleSave(price: IngredientPrice) {
    const packagePrice = form.packagePrice === "" ? null : parseFloat(form.packagePrice);
    const packageSize = form.packageSize === "" ? null : parseFloat(form.packageSize);
    const packageUnit = form.packageUnit || null;
    const density = form.density === "" ? null : parseFloat(form.density);

    if (packagePrice !== null && isNaN(packagePrice)) return;
    if (packageSize !== null && isNaN(packageSize)) return;
    if (density !== null && isNaN(density)) return;

    setSaving(true);
    const res = await fetch("/api/ingredients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: price.id,
        userPackagePrice: packagePrice,
        userPackageSize: packageSize,
        userPackageUnit: packageUnit,
        density,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error ?? "שגיאה בשמירה");
      setSaving(false);
      return;
    }
    const updated: IngredientPrice = await res.json();
    setPrices((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setSaving(false);
    setExpandedId(null);
  }

  async function handleClear(price: IngredientPrice) {
    const res = await fetch("/api/ingredients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: price.id, userPackagePrice: null, userPackageSize: null, userPackageUnit: null }),
    });
    const updated: IngredientPrice = await res.json();
    setPrices((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setExpandedId(null);
  }

  async function removeAlias(aliasPrice: IngredientPrice) {
    const res = await fetch("/api/ingredients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: aliasPrice.id, aliasOf: null }),
    });
    if (res.ok) {
      const updated: IngredientPrice = await res.json();
      setPrices((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    }
  }

  async function handleAddAlias(canonical: IngredientPrice, aliasName: string) {
    if (!aliasName) return;
    const aliasPrice = prices.find((p) => p.ingredientName === aliasName);
    if (!aliasPrice) return;
    const res = await fetch("/api/ingredients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: aliasPrice.id, aliasOf: canonical.ingredientName }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error ?? "שגיאה");
      return;
    }
    const updated: IngredientPrice = await res.json();
    setPrices((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setAddAliasValue("");
  }

  const renderRow = (canonical: IngredientPrice, aliases: IngredientPrice[]) => {
    const isExpanded = expandedId === canonical.id;
    const showDensity = canonical.unit === "גרם" || canonical.unit === 'מ"ל';
    const addable = addableAliases(canonical);
    const groupPrice = computeGroupPrice(canonical, aliases);
    const hasAnyPrice = groupPrice.price > 0;
    const isGrouped = aliases.length > 0;

    return (
      <div key={canonical.id} className={`border-b border-gray-50 last:border-0 ${isGrouped ? "border-r-4 border-r-blue-300" : ""}`}>
        <button
          onClick={() => openEdit(canonical)}
          className="w-full grid grid-cols-[1fr_auto_auto] gap-2 items-start px-4 py-3 text-right hover:bg-amber-50 transition-colors"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{canonical.ingredientName}</p>
            {aliases.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-1">
                {aliases.map((a) => (
                  <span key={a.id} className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                    {a.ingredientName}
                  </span>
                ))}
              </div>
            )}
            {canonical.packageInfo && !groupPrice.isManual && (
              <p className="text-xs text-gray-300 truncate mt-0.5">{canonical.packageInfo}</p>
            )}
          </div>

          <div className="text-center mt-0.5 min-w-[5rem]">
            {hasAnyPrice ? (
              <span className={`text-xs font-semibold ${groupPrice.isManual ? "text-amber-600" : "text-green-600"}`}>
                {formatPrice(groupPrice.price, canonical.unit)}
              </span>
            ) : (
              <span className="text-xs text-gray-200">—</span>
            )}
            {groupPrice.isManual && <p className="text-xs text-amber-400">ידני</p>}
          </div>

          <svg
            className={`w-4 h-4 text-gray-300 shrink-0 transition-transform mt-1 ${isExpanded ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isExpanded && (
          <div className="px-4 pb-4 bg-amber-50 border-t border-amber-100">
            <div className="mt-3 mb-3">
              <p className="text-xs font-semibold text-gray-500 mb-1.5">וריאציות של מרכיב זה</p>
              {aliases.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {aliases.map((a) => (
                    <span key={a.id} className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      {a.ingredientName}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeAlias(a); }}
                        className="text-blue-400 hover:text-blue-700 font-bold leading-none"
                      >×</button>
                    </span>
                  ))}
                </div>
              )}
              {addable.length > 0 && (
                <div className="flex gap-2 items-center">
                  <select
                    value={addAliasValue}
                    onChange={(e) => setAddAliasValue(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400 bg-white"
                  >
                    <option value="">+ הוסף וריאציה...</option>
                    {addable.map((p) => (
                      <option key={p.id} value={p.ingredientName}>{p.ingredientName}</option>
                    ))}
                  </select>
                  {addAliasValue && (
                    <button
                      onClick={() => handleAddAlias(canonical, addAliasValue)}
                      className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-xl hover:bg-blue-700"
                    >הוסף</button>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-amber-200 pt-3">
              <p className="text-xs font-semibold text-gray-500 mb-2">מחיר ידני לפי אריזה</p>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-xs text-gray-400 block mb-1">מחיר אריזה (₪)</label>
                  <input
                    type="number" min={0} step={0.01} placeholder="0.00"
                    value={form.packagePrice}
                    onChange={(e) => setForm((f) => ({ ...f, packagePrice: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400 bg-white"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-400 block mb-1">כמות באריזה</label>
                  <input
                    type="number" min={0} step={1} placeholder="500"
                    value={form.packageSize}
                    onChange={(e) => setForm((f) => ({ ...f, packageSize: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400 bg-white"
                  />
                </div>
                <div className="w-24">
                  <label className="text-xs text-gray-400 block mb-1">יחידה</label>
                  <select
                    value={form.packageUnit}
                    onChange={(e) => setForm((f) => ({ ...f, packageUnit: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-2 py-2 text-sm focus:outline-none focus:border-amber-400 bg-white"
                  >
                    {PACKAGE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              {form.packagePrice && form.packageSize && (
                <p className="text-xs text-amber-600 mt-2 font-medium">
                  ≈ {(() => {
                    const pp = parseFloat(form.packagePrice);
                    const ps = parseFloat(form.packageSize);
                    const FACTORS: Record<string, { label: string; f: number }> = {
                      'ק"ג': { label: "גרם", f: 1000 },
                      "קילוגרם": { label: "גרם", f: 1000 },
                      "ליטר": { label: 'מ"ל', f: 1000 },
                    };
                    const norm = FACTORS[form.packageUnit];
                    const per = pp / (ps * (norm?.f ?? 1));
                    const unit = norm?.label ?? form.packageUnit;
                    return isNaN(per) ? "—" : `₪${per.toFixed(4)} / ${unit}`;
                  })()}
                </p>
              )}
            </div>

            {showDensity && (
              <div className="mt-3">
                <label className="text-xs text-gray-500 block mb-1">
                  צפיפות (גרם/מ&quot;ל) — נדרש להמרת כף/כפית/כוס
                </label>
                <input
                  type="number" min={0} step={0.01} placeholder="לא ידוע"
                  value={form.density}
                  onChange={(e) => setForm((f) => ({ ...f, density: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400 bg-white"
                />
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <button
                onClick={() => handleSave(canonical)}
                disabled={saving}
                className="flex-1 bg-amber-500 text-white rounded-xl py-2 text-sm font-semibold hover:bg-amber-600 disabled:opacity-50"
              >
                {saving ? "שומר..." : "שמור"}
              </button>
              {canonical.userPrice != null && (
                <button
                  onClick={() => handleClear(canonical)}
                  className="px-4 border border-red-200 text-red-400 rounded-xl py-2 text-sm hover:bg-red-50"
                >נקה</button>
              )}
              <button
                onClick={() => setExpandedId(null)}
                className="px-4 border border-gray-200 text-gray-400 rounded-xl py-2 text-sm hover:bg-gray-50"
              >ביטול</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  async function handlePopulateDensities() {
    setPopulatingDensities(true);
    try {
      const res = await fetch("/api/ingredients/populate-densities", { method: "POST" });
      const data = await res.json();
      // Reload prices to reflect new density values
      const syncRes = await fetch("/api/ingredients", { method: "POST" });
      const updated = await syncRes.json();
      setPrices(Array.isArray(updated) ? updated : []);
      alert(`עודכן צפיפות ל-${data.filled} מתוך ${data.total} מרכיבים`);
    } catch {
      alert("שגיאה במילוי צפיפויות");
    } finally {
      setPopulatingDensities(false);
    }
  }

  async function handleSuggestGroups() {
    setSuggesting(true);
    setGroups([]);
    try {
      const names = prices.map((p) => p.ingredientName);
      const existingNames = new Set(names);
      const res = await fetch("/api/ingredients/suggest-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names }),
      });
      const data = await res.json();
      const suggestions: GroupSuggestion[] = (data.groups ?? []).map(
        (g: Omit<GroupSuggestion, "canonicalInDb">) => ({
          ...g,
          canonicalInDb: existingNames.has(g.canonical),
        })
      );
      setGroups(suggestions);
      const autoChecked = new Set<number>();
      suggestions.forEach((g, i) => { if (g.confidence === "high") autoChecked.add(i); });
      setCheckedGroups(autoChecked);
    } catch {
      alert("שגיאה בהצעת קיבוץ");
    } finally {
      setSuggesting(false);
    }
  }

  async function handleApplyGroups() {
    const selectedGroups = groups.filter((_, i) => checkedGroups.has(i));
    if (selectedGroups.length === 0) return;
    setApplyingGroups(true);
    try {
      const res = await fetch("/api/ingredients/apply-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups: selectedGroups }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "שגיאה בהחלת קיבוץ");
        return;
      }
      const syncRes = await fetch("/api/ingredients", { method: "POST" });
      const updated = await syncRes.json();
      setPrices(Array.isArray(updated) ? updated : []);
      setGroups([]);
      setCheckedGroups(new Set());
    } catch {
      alert("שגיאה בהחלת קיבוץ");
    } finally {
      setApplyingGroups(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
      </div>
    );
  }

  const withUserPrice = prices.filter((p) => p.userPrice != null).length;
  const withAutoPrice = prices.filter((p) => p.pricePerUnit > 0).length;

  return (
    <div className="min-h-screen bg-amber-50 pb-24">
      <header className="bg-white border-b border-amber-100 px-4 py-4 sticky top-0 z-40">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-amber-700">מחירי מרכיבים</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {withUserPrice} ידני · {withAutoPrice} אוטומטי
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePopulateDensities}
              disabled={populatingDensities || prices.length === 0}
              className="flex items-center gap-1.5 text-xs bg-purple-100 text-purple-700 font-semibold px-3 py-2 rounded-xl hover:bg-purple-200 disabled:opacity-50 transition-colors"
              title="מלא צפיפות לכל המרכיבים"
            >
              {populatingDensities ? (
                <span className="inline-block w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                "⚗️"
              )}
              צפיפויות
            </button>
            <button
              onClick={handleSuggestGroups}
              disabled={suggesting || prices.length === 0}
              className="flex items-center gap-1.5 text-xs bg-blue-100 text-blue-700 font-semibold px-3 py-2 rounded-xl hover:bg-blue-200 disabled:opacity-50 transition-colors"
            >
              {suggesting ? (
                <span className="inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                "🧩"
              )}
              הצע קיבוץ
            </button>
            <button
              onClick={handleRefreshAuto}
              disabled={refreshing || prices.length === 0}
              className="flex items-center gap-1.5 text-xs bg-amber-100 text-amber-700 font-semibold px-3 py-2 rounded-xl hover:bg-amber-200 disabled:opacity-50 transition-colors"
            >
              {refreshing ? (
                <span className="inline-block w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                "🔄"
              )}
              רענן אוטומטי
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 py-4 max-w-lg mx-auto">
        {/* Grouping confirmation panel */}
        {groups.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-blue-200 p-4 mb-4">
            <h2 className="font-semibold text-blue-700 mb-3">הצעות קיבוץ מרכיבים</h2>
            <div className="space-y-2 mb-4">
              {groups.map((g, i) => (
                <label key={i} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checkedGroups.has(i)}
                    onChange={(e) => {
                      const next = new Set(checkedGroups);
                      if (e.target.checked) next.add(i);
                      else next.delete(i);
                      setCheckedGroups(next);
                    }}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{g.canonical}</span>
                      {!g.canonicalInDb && (
                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">יווצר חדש</span>
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        g.confidence === "high" ? "bg-green-100 text-green-700"
                          : g.confidence === "medium" ? "bg-yellow-100 text-yellow-700"
                          : "bg-gray-100 text-gray-500"
                      }`}>
                        {g.confidence === "high" ? "גבוה" : g.confidence === "medium" ? "בינוני" : "נמוך"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">← {g.aliases.join(", ")}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleApplyGroups}
                disabled={applyingGroups || checkedGroups.size === 0}
                className="flex-1 bg-blue-600 text-white rounded-xl py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {applyingGroups ? "מחיל..." : `החל ${checkedGroups.size} קיבוצים`}
              </button>
              <button
                onClick={() => { setGroups([]); setCheckedGroups(new Set()); }}
                className="px-4 border border-gray-200 text-gray-500 rounded-xl py-2 text-sm hover:bg-gray-50"
              >
                ביטול
              </button>
            </div>
          </div>
        )}

        {allGroups.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-amber-100 text-center text-gray-400">
            אין מרכיבים עדיין. פתח מתכון כדי לטעון מחירים.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 pb-1 text-xs font-semibold text-gray-400">
              <span>מרכיב</span>
              <span className="min-w-[5rem] text-center">מחיר</span>
              <span className="w-4" />
            </div>

            {/* Grouped section */}
            {groupedItems.length > 0 && (
              <>
                <p className="text-xs font-semibold text-blue-500 px-1 mb-1.5">
                  קבוצות ({groupedItems.length})
                </p>
                <div className="bg-white rounded-2xl shadow-sm border border-blue-200 overflow-hidden mb-4">
                  {groupedItems.map(({ canonical, aliases }) => renderRow(canonical, aliases))}
                </div>
              </>
            )}

            {/* Standalone section */}
            {standaloneItems.length > 0 && (
              <>
                {groupedItems.length > 0 && (
                  <p className="text-xs font-semibold text-gray-400 px-1 mb-1.5">
                    בודדים ({standaloneItems.length})
                  </p>
                )}
                <div className="bg-white rounded-2xl shadow-sm border border-amber-100 overflow-hidden">
                  {standaloneItems.map(({ canonical, aliases }) => renderRow(canonical, aliases))}
                </div>
              </>
            )}

            <p className="text-xs text-gray-400 text-center mt-3">
              המחיר הידני גובר על האוטומטי בחישוב העלויות
            </p>
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );

}
