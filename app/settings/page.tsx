"use client";

import { useEffect, useState } from "react";
import BottomNav from "@/components/BottomNav";
import type { Setting } from "@/types";

const CATEGORIES: Record<string, string> = {
  infra: "תשתיות",
  labor: "עבודה",
  packaging: "אריזה",
  other: "אחר",
};

interface NewSettingForm {
  label: string;
  value: string;
  unit: string;
  category: string;
  isHourly: boolean;
}

const emptyForm: NewSettingForm = {
  label: "",
  value: "",
  unit: "₪/שעה",
  category: "infra",
  isHourly: true,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewSettingForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    // Seed defaults if needed
    await fetch("/api/settings", { method: "PUT" });
    const res = await fetch("/api/settings");
    const data = await res.json();
    setSettings(data);
    setLoading(false);
  }

  async function handleAdd() {
    setSaving(true);
    try {
      const key = form.label.toLowerCase().replace(/\s+/g, "_") + "_" + Date.now();
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          label: form.label,
          value: parseFloat(form.value) || 0,
          unit: form.unit,
          category: form.category,
          isHourly: form.isHourly,
        }),
      });
      const newSetting = await res.json();
      setSettings([...settings, newSetting]);
      setForm(emptyForm);
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateValue(setting: Setting, newValue: number) {
    await fetch(`/api/settings/${setting.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...setting, value: newValue }),
    });
    setSettings(settings.map((s) => (s.id === setting.id ? { ...s, value: newValue } : s)));
    setEditingId(null);
  }

  async function handleDelete(id: number) {
    if (!confirm("למחוק הגדרה זו?")) return;
    await fetch(`/api/settings/${id}`, { method: "DELETE" });
    setSettings(settings.filter((s) => s.id !== id));
  }

  const grouped = settings.reduce<Record<string, Setting[]>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-amber-50 pb-24">
      <header className="bg-white border-b border-amber-100 px-4 py-4 flex items-center justify-between sticky top-0 z-40">
        <h1 className="text-xl font-bold text-amber-700">⚙️ הגדרות עלויות</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-amber-500 hover:bg-amber-600 text-white rounded-full w-10 h-10 flex items-center justify-center text-2xl font-light transition-colors"
        >
          {showForm ? "✕" : "+"}
        </button>
      </header>

      <div className="px-4 py-4 max-w-lg mx-auto space-y-4">
        {/* Add new setting form */}
        {showForm && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-amber-200">
            <h2 className="font-semibold text-gray-700 mb-3">פרמטר עלות חדש</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">שם</label>
                <input
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                  placeholder="לדוג': גז, תיבות עוגה..."
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">ערך</label>
                  <input
                    type="number"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                    placeholder="0"
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">יחידה</label>
                  <input
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                    placeholder="₪/שעה"
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">קטגוריה</label>
                  <select
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400 bg-white"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    {Object.entries(CATEGORIES).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 flex items-end pb-0.5">
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isHourly}
                      onChange={(e) => setForm({ ...form, isHourly: e.target.checked })}
                      className="w-4 h-4 accent-amber-500"
                    />
                    לפי שעה
                  </label>
                </div>
              </div>
              <button
                onClick={handleAdd}
                disabled={saving || !form.label || !form.value}
                className="w-full bg-amber-500 text-white py-3 rounded-xl font-medium disabled:opacity-50 hover:bg-amber-600 transition-colors"
              >
                {saving ? "שומר..." : "הוסף פרמטר"}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
          </div>
        ) : (
          Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="bg-white rounded-2xl shadow-sm border border-amber-100 overflow-hidden">
              <div className="bg-amber-50 px-4 py-2 border-b border-amber-100">
                <h2 className="text-sm font-semibold text-amber-700">{CATEGORIES[category] ?? category}</h2>
              </div>
              <div>
                {items.map((setting) => (
                  <div key={setting.id} className="flex items-center px-4 py-3 border-b border-gray-50 last:border-0 gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{setting.label}</p>
                      <p className="text-xs text-gray-400">
                        {setting.unit}{setting.isHourly ? " · לפי שעה" : " · קבוע"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {editingId === setting.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            className="w-20 border border-amber-300 rounded-lg px-2 py-1 text-sm text-center focus:outline-none"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            autoFocus
                          />
                          <button
                            onClick={() => handleUpdateValue(setting, parseFloat(editValue) || 0)}
                            className="text-green-500 hover:text-green-700 p-1 text-lg"
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-gray-400 hover:text-gray-600 p-1"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingId(setting.id);
                            setEditValue(setting.value.toString());
                          }}
                          className="text-sm font-semibold text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5 border border-amber-200 hover:bg-amber-100"
                        >
                          ₪{setting.value}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(setting.id)}
                        className="text-red-400 hover:text-red-600 p-1"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {!loading && settings.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <div className="text-5xl mb-3">⚙️</div>
            <p>אין הגדרות עדיין</p>
            <p className="text-sm mt-1">לחץ + להוסיף פרמטרי עלות</p>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
