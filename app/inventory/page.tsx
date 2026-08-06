// app/inventory/page.tsx
"use client";

import { useEffect, useState } from "react";
import { categorizeItem, CATEGORY_ORDER } from "../lib/inventory";

interface InventoryItem {
  id: string;
  item: string;
  quantity: number;
  unit: string;
  last_updated: string;
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newItem, setNewItem] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState("");

  async function loadItems() {
    setLoading(true);
    try {
      const res = await fetch("/api/inventory");
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      setError("Couldn't load inventory.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
  }, []);

  async function handleAdd() {
    if (!newItem.trim() || !newQty.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item: newItem.trim(), quantity: Number(newQty), unit: newUnit.trim() }),
      });
      if (!res.ok) throw new Error("Couldn't add that item.");
      setNewItem("");
      setNewQty("");
      setNewUnit("");
      await loadItems();
    } catch (err: any) {
      setError(err.message ?? "Couldn't add that item.");
    } finally {
      setAdding(false);
    }
  }

  function startEdit(item: InventoryItem) {
    setEditingId(item.id);
    setEditQty(String(item.quantity));
  }

  async function saveEdit(item: InventoryItem) {
    setError(null);
    try {
      const res = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, item: item.item, unit: item.unit, quantity: Number(editQty) }),
      });
      if (!res.ok) throw new Error("Couldn't save that change.");
      setEditingId(null);
      await loadItems();
    } catch (err: any) {
      setError(err.message ?? "Couldn't save that change.");
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      const res = await fetch("/api/inventory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Couldn't remove that item.");
      await loadItems();
    } catch (err: any) {
      setError(err.message ?? "Couldn't remove that item.");
    }
  }

  return (
    <main className="min-h-screen bg-[#F7F6F2] px-5 py-8 md:px-10 md:py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
            <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#1C1C1E]">
              Inventory 🧺
            </h1>
            <p className="mt-1 text-sm text-[#1C1C1E]/50">
              What's actually in your kitchen right now.
            </p>
          </div>
          </div>

        {error && (
          <div className="mb-6 rounded-2xl bg-[#FF6B5A]/10 px-5 py-3.5 text-sm font-medium text-[#D14A3A]">
            {error}
          </div>
        )}

        {/* Add item — for stuff not from this app's grocery lists */}
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-[#1C1C1E]">Add an item</h2>
          <div className="flex flex-wrap gap-2">
            <input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="Item (e.g. rice)"
              className="min-w-[140px] flex-1 rounded-full bg-[#F7F6F2] px-4 py-2 text-sm text-[#1C1C1E] outline-none focus:ring-2 focus:ring-[#1C1C1E]/10"
            />
            <input
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              placeholder="Qty"
              type="number"
              className="w-20 rounded-full bg-[#F7F6F2] px-4 py-2 text-sm text-[#1C1C1E] outline-none focus:ring-2 focus:ring-[#1C1C1E]/10"
            />
            <input
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              placeholder="Unit (e.g. lb)"
              className="w-28 rounded-full bg-[#F7F6F2] px-4 py-2 text-sm text-[#1C1C1E] outline-none focus:ring-2 focus:ring-[#1C1C1E]/10"
            />
            <button
              onClick={handleAdd}
              disabled={adding}
              className="rounded-full bg-[#1C1C1E] px-5 py-2 text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-50"
            >
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
        </div>

        {/* Current stock — manually editable, for anything cooked outside the app */}
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-[#1C1C1E]">Current stock</h2>
          {loading && <p className="text-sm text-[#1C1C1E]/40">Loading…</p>}
          {!loading && items.length === 0 && (
            <p className="text-sm text-[#1C1C1E]/40">
              Nothing tracked yet — add an item above, or it'll fill in automatically
              as you generate grocery lists and cook meals.
            </p>
          )}

          {CATEGORY_ORDER.map((category) => {
            const categoryItems = items.filter((i) => categorizeItem(i.item) === category);
            if (categoryItems.length === 0) return null;

            return (
              <div key={category} className="mb-6 last:mb-0">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#1C1C1E]/40">
                  {category}
                </h3>
                <div className="space-y-2">
                  {categoryItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-[#F7F6F2] px-4 py-3"
                    >
                      <span className="flex-1 truncate text-sm font-semibold text-[#1C1C1E]">
                        {item.item}
                      </span>
                      {editingId === item.id ? (
                        <>
                          <input
                            value={editQty}
                            onChange={(e) => setEditQty(e.target.value)}
                            type="number"
                            autoFocus
                            className="w-20 rounded-full border-2 border-[#1C1C1E]/20 bg-white px-3 py-1.5 text-sm text-[#1C1C1E] outline-none"
                          />
                          <span className="text-sm text-[#1C1C1E]/40">{item.unit}</span>
                          <button
                            onClick={() => saveEdit(item)}
                            className="rounded-full bg-[#5FA88A] px-3 py-1.5 text-xs font-bold text-white"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs font-semibold text-[#1C1C1E]/30 hover:text-[#1C1C1E]/60"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-sm text-[#1C1C1E]/70">
                            {item.quantity} {item.unit}
                          </span>
                          <button
                            onClick={() => startEdit(item)}
                            className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#1C1C1E]/60 shadow-sm hover:text-[#1C1C1E]"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-xs font-semibold text-[#1C1C1E]/30 hover:text-[#FF6B5A]"
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
