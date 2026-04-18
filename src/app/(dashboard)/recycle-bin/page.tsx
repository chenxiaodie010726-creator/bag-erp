'use client';

import { useState } from 'react';
import { useRecycleBin, type RecycleBinItem } from '@/hooks/api/useRecycleBin';

/** 表名 → 中文标签 */
const TABLE_LABELS: Record<string, string> = {
  suppliers: '供应商',
  patterns: '产品',
  skus: 'SKU',
  customer_orders: '客户订单',
  work_orders: '生产单',
  customers: '客户',
  colors: '颜色',
};

const ALL_TABLES = Object.keys(TABLE_LABELS);

export default function RecycleBinPage() {
  const { items, loading, error, restore, permanentDelete, refresh } = useRecycleBin();
  const [activeTab, setActiveTab] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  /* 按 tab 过滤 */
  const filtered = activeTab === 'all'
    ? items
    : items.filter((i) => i.table === activeTab);

  /* 按表分组统计 */
  const countByTable = items.reduce<Record<string, number>>((acc, i) => {
    acc[i.table] = (acc[i.table] || 0) + 1;
    return acc;
  }, {});

  /* 全选/取消 */
  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((i) => `${i.table}:${i.id}`)));
    }
  }

  function toggleSelect(item: RecycleBinItem) {
    const key = `${item.table}:${item.id}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /* 恢复单条 */
  async function handleRestore(item: RecycleBinItem) {
    const key = `${item.table}:${item.id}`;
    setActionLoading(key);
    try {
      await restore(item.id, item.table);
      setSelected((prev) => { const n = new Set(prev); n.delete(key); return n; });
    } catch (e) {
      alert(e instanceof Error ? e.message : '恢复失败');
    } finally {
      setActionLoading(null);
    }
  }

  /* 彻底删除单条 */
  async function handleDelete(item: RecycleBinItem) {
    if (!confirm(`确定要彻底删除「${item.name}」吗？此操作不可撤销。`)) return;
    const key = `${item.table}:${item.id}`;
    setActionLoading(key);
    try {
      await permanentDelete(item.id, item.table);
      setSelected((prev) => { const n = new Set(prev); n.delete(key); return n; });
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败');
    } finally {
      setActionLoading(null);
    }
  }

  /* 批量恢复 */
  async function handleBatchRestore() {
    if (selected.size === 0) return;
    setActionLoading('batch');
    try {
      for (const key of selected) {
        const [table, id] = key.split(':');
        await restore(id, table);
      }
      setSelected(new Set());
    } catch (e) {
      alert(e instanceof Error ? e.message : '批量恢复失败');
    } finally {
      setActionLoading(null);
    }
  }

  /* 批量彻底删除 */
  async function handleBatchDelete() {
    if (selected.size === 0) return;
    if (!confirm(`确定要彻底删除选中的 ${selected.size} 条记录吗？此操作不可撤销。`)) return;
    setActionLoading('batch');
    try {
      for (const key of selected) {
        const [table, id] = key.split(':');
        await permanentDelete(id, table);
      }
      setSelected(new Set());
    } catch (e) {
      alert(e instanceof Error ? e.message : '批量删除失败');
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">回收站</h1>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50"
        >
          刷新
        </button>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => { setActiveTab('all'); setSelected(new Set()); }}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            activeTab === 'all'
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
        >
          全部 ({items.length})
        </button>
        {ALL_TABLES.map((t) => {
          const count = countByTable[t] || 0;
          if (count === 0) return null;
          return (
            <button
              key={t}
              onClick={() => { setActiveTab(t); setSelected(new Set()); }}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === t
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              {TABLE_LABELS[t]} ({count})
            </button>
          );
        })}
      </div>

      {/* 批量操作栏 */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
          <span className="text-sm text-blue-700">已选中 {selected.size} 项</span>
          <button
            onClick={handleBatchRestore}
            disabled={actionLoading === 'batch'}
            className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            批量恢复
          </button>
          <button
            onClick={handleBatchDelete}
            disabled={actionLoading === 'batch'}
            className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          >
            批量删除
          </button>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {/* 列表 */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">加载中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">回收站为空</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-3">名称</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">删除时间</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((item) => {
                const key = `${item.table}:${item.id}`;
                const isLoading = actionLoading === key;
                return (
                  <tr key={key} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={() => toggleSelect(item)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium">{item.name}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {TABLE_LABELS[item.table] || item.table}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(item.deleted_at).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => handleRestore(item)}
                        disabled={isLoading}
                        className="px-2.5 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100 disabled:opacity-50"
                      >
                        恢复
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        disabled={isLoading}
                        className="px-2.5 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100 disabled:opacity-50"
                      >
                        彻底删除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
