"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ExtractedRecipe } from "@/lib/claude";

type Tab = "url" | "text" | "photo";

interface PreviewRecipe extends ExtractedRecipe {
  sourceType: Tab;
  sourceUrl?: string;
}

export default function NewRecipePage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("url");
  const [urlInput, setUrlInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<PreviewRecipe | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleExtract() {
    setError("");
    setLoading(true);
    try {
      let body: Record<string, string>;

      if (tab === "url") {
        if (!urlInput.trim()) throw new Error("יש להזין כתובת URL");
        body = { type: "url", content: urlInput, url: urlInput };
      } else if (tab === "text") {
        if (!textInput.trim()) throw new Error("יש להזין טקסט מתכון");
        body = { type: "text", content: textInput };
      } else {
        if (!photoFile) throw new Error("יש לבחור תמונה");
        const base64 = await fileToBase64(photoFile);
        body = { type: "photo", content: base64, mimeType: photoFile.type };
      }

      const res = await fetch("/api/recipes/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "שגיאה בחילוץ המתכון");
      }

      const extracted: ExtractedRecipe = await res.json();
      setPreview({ ...extracted, sourceType: tab, sourceUrl: tab === "url" ? urlInput : undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!preview) return;
    setSaving(true);
    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: preview.name,
          sourceType: preview.sourceType,
          sourceUrl: preview.sourceUrl,
          instructions: preview.instructions,
          servingSize: preview.servingSize,
          ingredients: preview.ingredients,
        }),
      });
      if (!res.ok) throw new Error("שגיאה בשמירה");
      const saved = await res.json();
      router.push(`/recipes/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירה");
      setSaving(false);
    }
  }

  if (preview) {
    return (
      <div className="min-h-screen bg-amber-50 pb-8">
        <header className="bg-white border-b border-amber-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-40">
          <button onClick={() => setPreview(null)} className="text-gray-500 hover:text-gray-700 p-1">
            <svg className="w-6 h-6 rtl-flip" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-amber-700 flex-1">אישור מתכון</h1>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-amber-500 text-white px-4 py-2 rounded-xl font-medium disabled:opacity-50"
          >
            {saving ? "שומר..." : "שמור"}
          </button>
        </header>

        <div className="px-4 py-4 max-w-lg mx-auto space-y-4">
          {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-xl">{error}</p>}

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-amber-100">
            <label className="text-xs text-gray-500 font-medium mb-1 block">שם המתכון</label>
            <input
              className="w-full text-lg font-semibold text-gray-800 bg-transparent border-none outline-none"
              value={preview.name}
              onChange={(e) => setPreview({ ...preview, name: e.target.value })}
            />
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-amber-100">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-700">מרכיבים</h2>
              <span className="text-sm text-gray-400">כמות בסיס: {preview.servingSize}</span>
            </div>
            <div className="space-y-2">
              {preview.ingredients.map((ing, i) => (
                <div key={i} className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0">
                  <input
                    className="w-16 text-sm text-center bg-amber-50 rounded-lg px-2 py-1 border border-amber-100"
                    type="number"
                    value={ing.quantity}
                    onChange={(e) => {
                      const updated = [...preview.ingredients];
                      updated[i] = { ...updated[i], quantity: parseFloat(e.target.value) || 0 };
                      setPreview({ ...preview, ingredients: updated });
                    }}
                  />
                  <input
                    className="w-16 text-sm text-center bg-amber-50 rounded-lg px-2 py-1 border border-amber-100"
                    value={ing.unit}
                    onChange={(e) => {
                      const updated = [...preview.ingredients];
                      updated[i] = { ...updated[i], unit: e.target.value };
                      setPreview({ ...preview, ingredients: updated });
                    }}
                  />
                  <input
                    className="flex-1 text-sm text-gray-700 bg-transparent border-none outline-none"
                    value={ing.name}
                    onChange={(e) => {
                      const updated = [...preview.ingredients];
                      updated[i] = { ...updated[i], name: e.target.value };
                      setPreview({ ...preview, ingredients: updated });
                    }}
                  />
                  <button
                    onClick={() => {
                      const updated = preview.ingredients.filter((_, j) => j !== i);
                      setPreview({ ...preview, ingredients: updated });
                    }}
                    className="text-red-400 hover:text-red-600 p-1"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() =>
                setPreview({
                  ...preview,
                  ingredients: [...preview.ingredients, { name: "", quantity: 0, unit: "גרם" }],
                })
              }
              className="mt-3 text-sm text-amber-600 hover:text-amber-800 font-medium"
            >
              + הוסף מרכיב
            </button>
          </div>

          {preview.instructions && (
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-amber-100">
              <h2 className="font-semibold text-gray-700 mb-2">הוראות הכנה</h2>
              <textarea
                className="w-full text-sm text-gray-600 bg-transparent border-none outline-none resize-none"
                rows={6}
                value={preview.instructions}
                onChange={(e) => setPreview({ ...preview, instructions: e.target.value })}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-amber-50 pb-8">
      <header className="bg-white border-b border-amber-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-40">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 p-1">
          <svg className="w-6 h-6 rtl-flip" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-amber-700">הוספת מתכון</h1>
      </header>

      <div className="px-4 py-4 max-w-lg mx-auto">
        {/* Tabs */}
        <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-amber-100 mb-4">
          {(["url", "text", "photo"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                tab === t ? "bg-amber-500 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "url" ? "🔗 קישור" : t === "text" ? "📝 טקסט" : "📷 תמונה"}
            </button>
          ))}
        </div>

        {/* Input area */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-amber-100 mb-4">
          {tab === "url" && (
            <div>
              <label className="text-sm font-medium text-gray-600 mb-2 block">כתובת URL של מתכון</label>
              <input
                type="url"
                placeholder="https://www.example.com/recipe..."
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-400 text-left"
                dir="ltr"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-2">תומך באתרי מתכונים בעברית ובאנגלית</p>
            </div>
          )}

          {tab === "text" && (
            <div>
              <label className="text-sm font-medium text-gray-600 mb-2 block">הדבק טקסט מתכון</label>
              <textarea
                placeholder="הדבק כאן את המתכון..."
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-400 resize-none"
                rows={8}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
              />
            </div>
          )}

          {tab === "photo" && (
            <div>
              <label className="text-sm font-medium text-gray-600 mb-2 block">צלם או העלה תמונת מתכון</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              />
              {photoFile ? (
                <div className="text-center py-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={URL.createObjectURL(photoFile)}
                    alt="תמונת מתכון"
                    className="max-h-48 mx-auto rounded-xl object-contain"
                  />
                  <p className="text-sm text-gray-500 mt-2">{photoFile.name}</p>
                  <button
                    onClick={() => setPhotoFile(null)}
                    className="text-xs text-red-400 mt-1 hover:text-red-600"
                  >
                    הסר תמונה
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full border-2 border-dashed border-amber-300 rounded-xl py-10 flex flex-col items-center gap-2 text-amber-500 hover:bg-amber-50 transition-colors"
                >
                  <span className="text-3xl">📷</span>
                  <span className="text-sm font-medium">לחץ לצילום או העלאת תמונה</span>
                </button>
              )}
            </div>
          )}
        </div>

        {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-xl mb-4">{error}</p>}

        <button
          onClick={handleExtract}
          disabled={loading}
          className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-4 rounded-2xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              מחלץ מתכון...
            </>
          ) : (
            "✨ חלץ מתכון"
          )}
        </button>
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the "data:image/...;base64," prefix
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
