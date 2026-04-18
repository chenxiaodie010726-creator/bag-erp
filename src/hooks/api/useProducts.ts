'use client';

import { useState, useEffect, useCallback } from 'react';

export interface PatternRow {
  id: string;
  pattern_code: string;
  name: string;
  category: string | null;
  image_url: string | null;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  skus?: SkuRow[];
}

export interface SkuRow {
  id: string;
  sku_code: string;
  pattern_id: string;
  color: string | null;
  specifications: Record<string, string>;
  unit_price: number;
  image_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useProducts() {
  const [products, setProducts] = useState<PatternRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error('加载产品失败');
      setProducts(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : '未知错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (data: Record<string, unknown>) => {
    const res = await fetch('/api/products', {
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

  const update = useCallback(async (id: string, data: Record<string, unknown>) => {
    const res = await fetch(`/api/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '更新失败');
    }
    await load();
    return res.json();
  }, [load]);

  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '删除失败');
    }
    await load();
  }, [load]);

  return { products, loading, error, create, update, remove, refresh: load };
}
