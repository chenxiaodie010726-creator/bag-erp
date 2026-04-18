'use client';

import { useState, useEffect, useCallback } from 'react';

export interface OrderRow {
  id: string;
  po_number: string;
  customer_id: string | null;
  order_date: string;
  delivery_date: string | null;
  status: string;
  total_amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  customer?: { name: string; customer_code: string } | null;
}

export function useOrders() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/orders');
      if (!res.ok) throw new Error('加载订单失败');
      setOrders(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : '未知错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (data: Record<string, unknown>) => {
    const res = await fetch('/api/orders', {
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
    const res = await fetch(`/api/orders/${id}`, {
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
    const res = await fetch(`/api/orders/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '删除失败');
    }
    await load();
  }, [load]);

  return { orders, loading, error, create, update, remove, refresh: load };
}
