'use client';

import { useColors } from '@/hooks/api/useColors';
import type { ColorRegistryEntry } from '@/lib/colorRegistry';

/** 颜色注册表条目（来自 API，多实例共享同一份缓存） */
export function useColorRegistry(): ColorRegistryEntry[] {
  const { entries } = useColors();
  return entries;
}
