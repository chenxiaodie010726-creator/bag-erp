'use client';

import { useState, useEffect, useCallback } from 'react';

export interface RecycleBinItem {
  id: string;
  table: string;
  label: string;
  name: string;
  deleted_at: string;
}

export function useRecycleBin() {
  const [items, setItems] = useState<RecycleBinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/recycle-bin');
      if (!res.ok) throw new Error('加载回收站失败');
      setItems(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : '未知错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** 恢复已删除项 */
  const restore = useCallback(async (id: string, table: string) => {
    const res = await fetch(`/api/recycle-bin/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '恢复失败');
    }
    await load();
  }, [load]);

  /** 彻底删除 */
  const permanentDelete = useCallback(async (id: string, table: string) => {
    const res = await fetch(`/api/recycle-bin/${id}?table=${table}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '删除失败');
    }
    await load();
  }, [load]);

  return { items, loading, error, restore, permanentDelete, refresh: load };
}
