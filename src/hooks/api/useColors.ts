'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { DEFAULT_SEED, type ColorRegistryEntry } from '@/lib/colorRegistry';

type ApiColorRow = {
  id: string;
  keywords: string[] | null;
  hex: string;
  sort_order?: number;
  deleted_at?: string | null;
};

function mapApiRow(row: ApiColorRow): ColorRegistryEntry {
  return {
    id: row.id,
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    hex: row.hex,
  };
}

type ColorsStore = {
  entries: ColorRegistryEntry[];
  loading: boolean;
  error: string | null;
};

let store: ColorsStore = {
  entries: [],
  loading: true,
  error: null,
};

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function setStore(next: ColorsStore) {
  store = next;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ColorsStore {
  return store;
}

function getServerSnapshot(): ColorsStore {
  return { entries: [], loading: true, error: null };
}

let inflightRefresh: Promise<void> | null = null;

async function runRefresh(): Promise<void> {
  setStore({ ...store, loading: true, error: null });
  try {
    const res = await fetch('/api/colors');
    const data: unknown = await res.json();
    if (!res.ok) {
      const msg =
        typeof data === 'object' && data !== null && 'error' in data && typeof (data as { error: unknown }).error === 'string'
          ? (data as { error: string }).error
          : '加载颜色失败';
      throw new Error(msg);
    }
    let rows = data as ApiColorRow[];
    if (!Array.isArray(rows)) throw new Error('颜色数据格式错误');

    if (rows.length === 0) {
      const seedBody = DEFAULT_SEED.map(({ keywords, hex }) => ({
        keywords: [...keywords],
        hex,
      }));
      const putRes = await fetch('/api/colors', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(seedBody),
      });
      const putData: unknown = await putRes.json();
      if (!putRes.ok) {
        const msg =
          typeof putData === 'object' &&
          putData !== null &&
          'error' in putData &&
          typeof (putData as { error: unknown }).error === 'string'
            ? (putData as { error: string }).error
            : '写入默认颜色失败';
        throw new Error(msg);
      }
      rows = putData as ApiColorRow[];
      if (!Array.isArray(rows)) throw new Error('颜色数据格式错误');
    }

    setStore({
      entries: rows.map(mapApiRow),
      loading: false,
      error: null,
    });
  } catch (e) {
    setStore({
      entries: store.entries,
      loading: false,
      error: e instanceof Error ? e.message : '未知错误',
    });
  }
}

function refreshInternal(): Promise<void> {
  if (!inflightRefresh) {
    inflightRefresh = runRefresh().finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

export function useColors() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const refresh = useCallback(() => refreshInternal(), []);

  useEffect(() => {
    void refreshInternal();
  }, []);

  const replaceAll = useCallback(async (next: ColorRegistryEntry[]): Promise<ColorRegistryEntry[]> => {
    const body = next.map((e) => ({
      id: e.id,
      keywords: e.keywords,
      hex: e.hex,
    }));
    const res = await fetch('/api/colors', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data: unknown = await res.json();
    if (!res.ok) {
      const msg =
        typeof data === 'object' && data !== null && 'error' in data && typeof (data as { error: unknown }).error === 'string'
          ? (data as { error: string }).error
          : '保存颜色失败';
      throw new Error(msg);
    }
    const rows = data as ApiColorRow[];
    if (!Array.isArray(rows)) throw new Error('颜色数据格式错误');
    const mapped = rows.map(mapApiRow);
    setStore({ entries: mapped, loading: false, error: null });
    return mapped;
  }, []);

  return {
    entries: snap.entries,
    loading: snap.loading,
    error: snap.error,
    replaceAll,
    refresh,
  };
}
