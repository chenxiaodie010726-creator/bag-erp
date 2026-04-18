'use client';

import { useState, useEffect, useCallback } from 'react';

export function usePackingList() {
  const [packingLists, setPackingLists] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/packing-list');
      if (!res.ok) throw new Error('加载装箱单失败');
      setPackingLists(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : '未知错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (data: Record<string, unknown>) => {
    const res = await fetch('/api/packing-list', {
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
    const res = await fetch(`/api/packing-list/${id}`, {
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
    const res = await fetch(`/api/packing-list/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '删除失败');
    }
    await load();
  }, [load]);

  return { packingLists, loading, error, create, update, remove, refresh: load };
}
