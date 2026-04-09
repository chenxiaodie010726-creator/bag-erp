'use client';

import { useEffect, useState } from 'react';

interface UndoToastProps {
  canUndo: boolean;
  nextDescription: string | null;
  undoCount: number;
  onUndo: () => void;
  lastUndone: { description: string; timestamp: number } | null;
  onDismiss: () => void;
}

const slideUpKeyframes = `
@keyframes undoSlideUp {
  from { opacity: 0; transform: translate(-50%, 12px); }
  to   { opacity: 1; transform: translate(-50%, 0); }
}
`;

export default function UndoToast({
  canUndo,
  nextDescription,
  undoCount,
  onUndo,
  lastUndone,
  onDismiss,
}: UndoToastProps) {
  const [showConfirmation, setShowConfirmation] = useState(false);

  useEffect(() => {
    if (lastUndone) {
      setShowConfirmation(true);
      const timer = setTimeout(() => {
        setShowConfirmation(false);
        onDismiss();
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setShowConfirmation(false);
    }
  }, [lastUndone, onDismiss]);

  if (showConfirmation && lastUndone) {
    return (
      <>
        <style>{slideUpKeyframes}</style>
        <div
          className="fixed bottom-6 left-1/2 z-[100]"
          style={{ animation: 'undoSlideUp 200ms ease-out forwards' }}
        >
          <div className="flex items-center gap-3 px-4 py-3 bg-green-600 text-white rounded-xl shadow-2xl">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-medium">
              已撤回：{lastUndone.description}
            </span>
            {canUndo && (
              <span className="text-xs text-green-200 ml-1">
                （还可撤回 {undoCount} 次）
              </span>
            )}
          </div>
        </div>
      </>
    );
  }

  if (!canUndo) return null;

  return (
    <>
      <style>{slideUpKeyframes}</style>
      <div
        className="fixed bottom-6 left-1/2 z-[100]"
        style={{ animation: 'undoSlideUp 250ms ease-out forwards' }}
      >
        <div className="flex items-center gap-2 pl-4 pr-2 py-2 bg-gray-900 text-white rounded-xl shadow-2xl border border-gray-700">
          <div className="flex items-center gap-2 min-w-0">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            <span className="text-sm text-gray-300 truncate max-w-[240px]">
              {nextDescription}
            </span>
          </div>
          <button
            onClick={onUndo}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-500 hover:bg-blue-400 rounded-lg transition-colors flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            撤回
          </button>
          <span className="text-xs text-gray-500 tabular-nums flex-shrink-0 ml-1">
            {undoCount}/20
          </span>
        </div>
        <p className="text-center text-xs text-gray-400 mt-1.5">Ctrl+Z 快速撤回</p>
      </div>
    </>
  );
}
