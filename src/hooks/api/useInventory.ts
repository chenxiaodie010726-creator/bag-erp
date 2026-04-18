'use client';

import { useState, useEffect, useCallback } from 'react';

export function useInventory() {
  const [inventory, setInventory] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/inventory');
      if (!res.ok) throw new Error('加载库存失败');
      setInventory(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : '未知错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createShipment = useCallback(async (data: Record<string, unknown>) => {
    const res = await fetch('/api/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '创建出库记录失败');
    }
    await load();
    return res.json();
  }, [load]);

  return { inventory, loading, error, createShipment, refresh: load };
}
