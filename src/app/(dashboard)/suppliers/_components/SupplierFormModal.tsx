'use client';

/* ============================================================
 * 供应商新增 / 编辑弹窗
 * mode='create' 新建 | mode='edit' 编辑
 * ============================================================ */

import { useState, useEffect } from 'react';
import type { SupplierItem, SupplierType, SupplierCategory, SupplierStatus, PaymentTermUnitCode } from './mockData';
import {
  SUPPLIER_CATEGORIES_MATERIAL,
  SUPPLIER_CATEGORIES_PROCESS,
  parsePaymentTerm,
  formatPaymentTerm,
} from './mockData';

interface SupplierFormModalProps {
  mode: 'create' | 'edit';
  supplier?: SupplierItem | null;
  /** 物料供应商可选分类（含自定义） */
  materialCategories?: SupplierCategory[];
  /** 工艺供应商可选分类（含自定义） */
  processCategories?: SupplierCategory[];
  onClose: () => void;
  onConfirm: (supplier: SupplierItem) => void;
}

const FORM_INPUT = 'w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white';

interface FormData {
  name: string;
  fullName: string;
  type: SupplierType;
  category: SupplierCategory;
  paymentAmount: string;
  paymentUnit: PaymentTermUnitCode;
  wechatId: string;
  contactGroup: string;
  groupMembers: string;
  status: SupplierStatus;
}

function emptyForm(): FormData {
  return {
    name: '',
    fullName: '',
    type: '物料供应商',
    category: '面料',
    paymentAmount: '30',
    paymentUnit: 'day',
    wechatId: '',
    contactGroup: '',
    groupMembers: '',
    status: '启用',
  };
}

function supplierToForm(s: SupplierItem): FormData {
  const p = parsePaymentTerm(s.paymentTerm);
  return {
    name: s.name,
    fullName: s.fullName,
    type: s.type,
    category: s.category,
    paymentAmount: String(p.amount),
    paymentUnit: p.unit,
    wechatId: s.wechatId,
    contactGroup: s.contactGroup,
    groupMembers: s.groupMembers > 0 ? String(s.groupMembers) : '',
    status: s.status,
  };
}

export default function SupplierFormModal({
  mode,
  supplier,
  materialCategories = [...SUPPLIER_CATEGORIES_MATERIAL],
  processCategories = [...SUPPLIER_CATEGORIES_PROCESS],
  onClose,
  onConfirm,
}: SupplierFormModalProps) {
  const [form, setForm] = useState<FormData>(emptyForm);

  const categoryOptions = form.type === '物料供应商' ? materialCategories : processCategories;

  useEffect(() => {
    if (mode === 'edit' && supplier) {
      const base = supplierToForm(supplier);
      const opts = supplier.type === '物料供应商' ? materialCategories : processCategories;
      if (!opts.includes(base.category)) {
        base.category = (opts.includes('其他') ? '其他' : opts[0] ?? '其他') as SupplierCategory;
      }
      setForm(base);
    } else {
      setForm(emptyForm());
    }
  }, [mode, supplier, materialCategories, processCategories]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      alert('请填写供应商名称');
      return;
    }

    const amount = parseFloat(form.paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('请填写有效的账期数值（大于 0）');
      return;
    }

    const result: SupplierItem = {
      id: mode === 'edit' && supplier ? supplier.id : `created_${Date.now()}`,
      name: form.name.trim(),
      fullName: form.fullName.trim() || form.name.trim(),
      type: form.type,
      category: form.category,
      paymentTerm: formatPaymentTerm(amount, form.paymentUnit),
      wechatBound: !!form.wechatId.trim(),
      contactGroup: form.contactGroup.trim(),
      groupMembers: parseInt(form.groupMembers, 10) || 0,
      wechatId: form.wechatId.trim(),
      hasLicense: mode === 'edit' && supplier ? supplier.hasLicense : false,
      status: form.status,
      createdAt: mode === 'edit' && supplier ? supplier.createdAt : new Date().toISOString().slice(0, 10),
    };

    onConfirm(result);
  }

  const title = mode === 'create' ? '新增供应商' : '编辑供应商';
  const submitText = mode === 'create' ? '创建' : '保存';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="供应商名称 *">
              <input
                required
                type="text"
                placeholder="如 华信贸易"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={FORM_INPUT}
              />
            </FormField>
            <FormField label="公司全称">
              <input
                type="text"
                placeholder="如 深圳市华信贸易有限公司"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className={FORM_INPUT}
              />
            </FormField>
            <FormField label="供应商类型">
              <select
                value={form.type}
                onChange={(e) => {
                  const nextType = e.target.value as SupplierType;
                  const opts = nextType === '物料供应商' ? materialCategories : processCategories;
                  let nextCat = form.category;
                  if (!opts.includes(nextCat)) nextCat = (opts[0] ?? '其他') as SupplierCategory;
                  setForm({ ...form, type: nextType, category: nextCat });
                }}
                className={FORM_INPUT}
              >
                <option value="物料供应商">物料供应商</option>
                <option value="工艺供应商">工艺供应商</option>
              </select>
            </FormField>
            <FormField label="供应商分类">
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as SupplierCategory })}
                className={FORM_INPUT}
              >
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </FormField>
            <FormField label="默认账期">
              <div className="flex gap-2 items-center min-w-0">
                {/* type="text"：避免部分环境下 number 在 flex 内无法聚焦/无法键入；提交时仍校验为数字 */}
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="如 45 或 3"
                  value={form.paymentAmount}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '' || /^\d*\.?\d*$/.test(v)) {
                      setForm({ ...form, paymentAmount: v });
                    }
                  }}
                  className={`${FORM_INPUT} flex-1 min-w-[5rem] basis-0`}
                />
                <select
                  value={form.paymentUnit}
                  onChange={(e) => setForm({ ...form, paymentUnit: e.target.value as PaymentTermUnitCode })}
                  className={`${FORM_INPUT} w-[5.5rem] shrink-0`}
                  aria-label="账期单位"
                >
                  <option value="day">天</option>
                  <option value="month">个月</option>
                </select>
              </div>
            </FormField>
            <FormField label="状态">
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as SupplierStatus })}
                className={FORM_INPUT}
              >
                <option value="启用">启用</option>
                <option value="停用">停用</option>
              </select>
            </FormField>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-500 mb-3">企业微信信息（选填）</p>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="微信号">
                <input
                  type="text"
                  placeholder="如 wx_huaxin2024"
                  value={form.wechatId}
                  onChange={(e) => setForm({ ...form, wechatId: e.target.value })}
                  className={FORM_INPUT}
                />
              </FormField>
              <FormField label="联系群名称">
                <input
                  type="text"
                  placeholder="如 华信贸易采购群"
                  value={form.contactGroup}
                  onChange={(e) => setForm({ ...form, contactGroup: e.target.value })}
                  className={FORM_INPUT}
                />
              </FormField>
              <FormField label="群成员数">
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.groupMembers}
                  onChange={(e) => setForm({ ...form, groupMembers: e.target.value })}
                  className={FORM_INPUT}
                />
              </FormField>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              {submitText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}
