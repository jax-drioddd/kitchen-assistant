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
  purchase_fraction: string | null;
}

const ACCENT = "#E8674A";

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
    <main className="min-h-screen bg-white dark:bg-[#121212] px-5 py-8 md:px-10 md:py-12">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-[#1A1A1A] dark:text-[#F0F0F0]">Inventory</h1>
          <p className="mt-0.5 text-sm text-[#1A1A1A]/45 dark:text-[#F0F0F0]/45">What's actually in your kitchen right now.</p>
        </header>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        <div className="mb-8 border-b border-[#1A1A1A]/8 dark:border-[#F0F0F0]/8 pb-6">
          <h2 className="mb-3 text-sm font-bold text-[#1A1A1A] dark:text-[#F0F0F0]">Add an item</h2>
          <div className="flex flex-wrap gap-2">
            <input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="Item (e.g. rice)"
              className="min-w-[140px] flex-1 rounded-full border border-[#1A1A1A]/12 dark:border-[#F0F0F0]/12 px-4 py-2 text-sm text-[#1A1A1A] dark:text-[#F0F0F0] outline-none focus:border-[#1A1A1A]/30 dark:focus:border-[#F0F0F0]/30"
            />
            <input
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              placeholder="Qty"
              type="number"
              className="w-20 rounded-full border border-[#1A1A1A]/12 dark:border-[#F0F0F0]/12 px-4 py-2 text-sm text-[#1A1A1A] dark:text-[#F0F0F0] outline-none focus:border-[#1A1A1A]/30 dark:focus:border-[#F0F0F0]/30"
            />
            <input
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              placeholder="Unit (e.g. lb)"
              className="w-24 rounded-full border border-[#1A1A1A]/12 dark:border-[#F0F0F0]/12 px-4 py-2 text-sm text-[#1A1A1A] dark:text-[#F0F0F0] outline-none focus:border-[#1A1A1A]/30 dark:focus:border-[#F0F0F0]/30"
            />
            <button
              onClick={handleAdd}
              disabled={adding}
              className="rounded-full px-5 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: ACCENT }}
            >
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
        </div>

        <div>
          {loading && <p className="text-sm text-[#1A1A1A]/40 dark:text-[#F0F0F0]/40">Loading…</p>}
          {!loading && items.length === 0 && (
            <p className="text-sm text-[#1A1A1A]/40 dark:text-[#F0F0F0]/40">
              Nothing tracked yet — add an item above, or it'll fill in automatically as you generate grocery lists and cook meals.
            </p>
          )}

          {CATEGORY_ORDER.map((category) => {
            const categoryItems = items.filter((i) => categorizeItem(i.item) === category);
            if (categoryItems.length === 0) return null;

            return (
              <div key={category} className="mb-6 last:mb-0">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#1A1A1A]/40 dark:text-[#F0F0F0]/40">{category}</h3>
                <div className="divide-y divide-[#1A1A1A]/8">
                  {categoryItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="flex-1 truncate text-sm font-semibold text-[#1A1A1A] dark:text-[#F0F0F0]">{item.item}</span>
                      {editingId === item.id ? (
                        <>
                          <input
                            value={editQty}
                            onChange={(e) => setEditQty(e.target.value)}
                            type="number"
                            autoFocus
                            className="w-16 rounded-full border border-[#1A1A1A]/20 dark:border-[#F0F0F0]/20 px-2 py-1 text-sm text-[#1A1A1A] dark:text-[#F0F0F0] outline-none"
                          />
                          <span className="text-sm text-[#1A1A1A]/40 dark:text-[#F0F0F0]/40">{item.unit}</span>
                          <button onClick={() => saveEdit(item)} className="text-xs font-bold" style={{ color: ACCENT }}>
                            Save
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-xs font-semibold text-[#1A1A1A]/30 dark:text-[#F0F0F0]/30 hover:text-[#1A1A1A]/60 dark:hover:text-[#F0F0F0]/60">
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-sm text-[#1A1A1A]/60 dark:text-[#F0F0F0]/60">
                            {Math.round(item.quantity * 100) / 100} {item.unit}
                            {item.purchase_fraction && (
                              <span className="ml-1 text-[#1A1A1A]/35 dark:text-[#F0F0F0]/35">
                                ({item.purchase_fraction})
                              </span>
                            )}
                          </span>
                          <button onClick={() => startEdit(item)} className="text-xs font-semibold text-[#1A1A1A]/40 dark:text-[#F0F0F0]/40 hover:text-[#1A1A1A] dark:hover:text-[#F0F0F0]">
                            Edit
                          </button>
                          <button onClick={() => handleDelete(item.id)} className="text-xs font-semibold text-[#1A1A1A]/30 dark:text-[#F0F0F0]/30 hover:text-red-500">
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
