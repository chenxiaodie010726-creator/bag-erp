'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

export interface UndoEntry<T> {
  snapshot: T;
  description: string;
  timestamp: number;
}

const MAX_HISTORY = 20;

/**
 * Generic undo-history manager. Stores up to 20 snapshots of previous state.
 *
 * Usage pattern:
 *   const undo = useUndoManager<MyData[]>();
 *
 *   // Before any mutation:
 *   undo.push(currentData, '修改了产品价格');
 *   setData(newData);
 *
 *   // To undo:
 *   const prev = undo.pop();
 *   if (prev) setData(prev.snapshot);
 */
export function useUndoManager<T>() {
  const [history, setHistory] = useState<UndoEntry<T>[]>([]);
  const [lastUndone, setLastUndone] = useState<UndoEntry<T> | null>(null);

  const push = useCallback((snapshot: T, description: string) => {
    setHistory((prev) => {
      const entry: UndoEntry<T> = {
        snapshot: structuredClone(snapshot),
        description,
        timestamp: Date.now(),
      };
      const next = [entry, ...prev];
      if (next.length > MAX_HISTORY) next.length = MAX_HISTORY;
      return next;
    });
    setLastUndone(null);
  }, []);

  const pop = useCallback((): UndoEntry<T> | null => {
    let result: UndoEntry<T> | null = null;
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const [first, ...rest] = prev;
      result = first;
      return rest;
    });
    if (result) setLastUndone(result);
    return result;
  }, []);

  const clear = useCallback(() => {
    setHistory([]);
    setLastUndone(null);
  }, []);

  return {
    push,
    pop,
    clear,
    canUndo: history.length > 0,
    undoCount: history.length,
    lastUndone,
    /** Most recent description in the stack (next to be undone) */
    nextDescription: history.length > 0 ? history[0].description : null,
    dismissLastUndone: () => setLastUndone(null),
  };
}

/**
 * Provides a global Ctrl+Z / Cmd+Z keyboard binding that calls onUndo.
 * Skips when user is focused on an input/textarea/select to avoid interfering with native undo.
 */
export function useUndoKeyboard(onUndo: () => void, enabled: boolean) {
  const ref = useRef(onUndo);
  ref.current = onUndo;

  useEffect(() => {
    if (!enabled) return;
    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        ref.current();
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [enabled]);
}
