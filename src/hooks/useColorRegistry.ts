'use client';

import { useEffect, useState } from 'react';
import {
  COLOR_REGISTRY_CHANGED_EVENT,
  COLOR_REGISTRY_STORAGE_KEY,
  loadColorRegistry,
  type ColorRegistryEntry,
} from '@/lib/colorRegistry';

export function useColorRegistry(): ColorRegistryEntry[] {
  const [entries, setEntries] = useState<ColorRegistryEntry[]>(() =>
    typeof window !== 'undefined' ? loadColorRegistry() : [],
  );

  useEffect(() => {
    function refresh() {
      setEntries(loadColorRegistry());
    }
    refresh();
    window.addEventListener(COLOR_REGISTRY_CHANGED_EVENT, refresh);
    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key === COLOR_REGISTRY_STORAGE_KEY) refresh();
    });
    return () => {
      window.removeEventListener(COLOR_REGISTRY_CHANGED_EVENT, refresh);
    };
  }, []);

  return entries;
}
