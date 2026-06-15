// Cart lookup hook + module
// Provides a fast `{product_id}::{distributor_id} -> { qty, item_id }` map for the UI
// to render "In cart (N)" pills with +/- steppers in search/product/scan screens.
//
// Usage:
//   const { lookup, refresh, getQty, updateQty } = useCartLookup();
//   const qty = getQty(productId, distributorId);
//
import { useEffect, useState, useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { showError } from "@/src/components/Toast";

export type CartLookupEntry = { item_id: string; qty: number };
export type CartLookup = Record<string, CartLookupEntry>;

const keyOf = (productId: string, distributorId: string) => `${productId}::${distributorId}`;

// In-memory global cache so multiple screens stay in sync
let globalLookup: CartLookup = {};
let globalCount = 0;
const subs = new Set<() => void>();

function notify() {
  subs.forEach((fn) => fn());
}

export async function refreshCartLookup() {
  try {
    const r: any = await api("/cart/lookup");
    globalLookup = r.items || {};
    globalCount = r.count || 0;
    notify();
    return { lookup: globalLookup, count: globalCount };
  } catch {
    return { lookup: globalLookup, count: globalCount };
  }
}

export function useCartLookup(autoRefresh = true) {
  const [, force] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const fn = () => mounted.current && force((n) => n + 1);
    subs.add(fn);
    if (autoRefresh && Object.keys(globalLookup).length === 0) refreshCartLookup();
    return () => {
      mounted.current = false;
      subs.delete(fn);
    };
  }, [autoRefresh]);

  useFocusEffect(
    useCallback(() => {
      if (autoRefresh) refreshCartLookup();
    }, [autoRefresh])
  );

  const getQty = (productId: string, distributorId: string) =>
    globalLookup[keyOf(productId, distributorId)]?.qty || 0;

  const getEntry = (productId: string, distributorId: string) =>
    globalLookup[keyOf(productId, distributorId)];

  const addOne = async (productId: string, distributorId: string) => {
    // optimistic
    const k = keyOf(productId, distributorId);
    const before = globalLookup[k];
    globalLookup = {
      ...globalLookup,
      [k]: { item_id: before?.item_id || "tmp", qty: (before?.qty || 0) + 1 },
    };
    globalCount += 1;
    notify();
    try {
      await api("/cart/items", {
        method: "POST",
        body: { product_id: productId, distributor_id: distributorId, qty: 1 },
      });
      await refreshCartLookup();
    } catch (e: any) {
      // revert
      if (before) globalLookup = { ...globalLookup, [k]: before };
      else {
        const { [k]: _, ...rest } = globalLookup;
        globalLookup = rest;
      }
      globalCount -= 1;
      notify();
      showError(e?.message || "Could not add to cart", "Add failed");
    }
  };

  const updateQty = async (productId: string, distributorId: string, qty: number) => {
    const k = keyOf(productId, distributorId);
    const entry = globalLookup[k];
    if (!entry) {
      // no item yet — only add when qty > 0
      if (qty > 0) {
        try {
          await api("/cart/items", {
            method: "POST",
            body: { product_id: productId, distributor_id: distributorId, qty },
          });
          await refreshCartLookup();
        } catch (e: any) {
          showError(e?.message || "Could not add to cart", "Add failed");
        }
      }
      return;
    }
    const newQty = Math.max(0, qty);
    if (newQty === 0) {
      // delete
      const { [k]: removed, ...rest } = globalLookup;
      globalLookup = rest;
      globalCount = Math.max(0, globalCount - entry.qty);
      notify();
      try {
        await api(`/cart/items/${entry.item_id}`, { method: "DELETE" });
        await refreshCartLookup();
      } catch (e: any) {
        showError(e?.message || "Could not remove from cart", "Update failed");
        await refreshCartLookup();
      }
      return;
    }
    const delta = newQty - entry.qty;
    globalLookup = { ...globalLookup, [k]: { ...entry, qty: newQty } };
    globalCount += delta;
    notify();
    try {
      await api(`/cart/items/${entry.item_id}`, { method: "PATCH", body: { qty: newQty } });
      await refreshCartLookup();
    } catch (e: any) {
      showError(e?.message || "Could not update quantity", "Update failed");
      await refreshCartLookup();
    }
  };

  return {
    lookup: globalLookup,
    count: globalCount,
    getQty,
    getEntry,
    addOne,
    updateQty,
    refresh: refreshCartLookup,
  };
}
