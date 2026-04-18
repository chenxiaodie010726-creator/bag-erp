'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PatternRow } from './useProducts';

export function useSets() {
  const [sets, setSets] = useState<PatternRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/sets');
      if (!res.ok) throw new Error('加载套装失败');
      setSets(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : '未知错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (data: Record<string, unknown>) => {
    const res = await fetch('/api/sets', {
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
    const res = await fetch(`/api/sets/${id}`, {
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
    const res = await fetch(`/api/sets/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '删除失败');
    }
    await load();
  }, [load]);

  return { sets, loading, error, create, update, remove, refresh: load };
}
