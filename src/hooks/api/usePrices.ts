'use client';

import { useState, useEffect, useCallback } from 'react';

export interface PriceRow {
  id: string;
  sku_id: string;
  material_name: string;
  material_type: string | null;
  specification: string | null;
  unit: string | null;
  quantity_per_unit: number;
  supplier_id: string | null;
  unit_cost: number;
  notes: string | null;
  supplier?: { name: string; supplier_code: string } | null;
}

export function usePrices() {
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/prices');
      if (!res.ok) throw new Error('加载价格失败');
      setPrices(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : '未知错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const bulkUpdate = useCallback(async (items: Partial<PriceRow>[]) => {
    const res = await fetch('/api/prices', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '更新失败');
    }
    await load();
  }, [load]);

  const create = useCallback(async (data: Partial<PriceRow>) => {
    const res = await fetch('/api/prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '创建失败');
    }
    await load();
    return res.json();
  }, [load]);

  return { prices, loading, error, create, bulkUpdate, refresh: load };
}
