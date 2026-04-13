'use client';

import { useCallback, useState } from 'react';
import { embossStampIds } from '@/data/embossStampCatalog';

type Props = {
  className?: string;
};

/**
 * 压唛编号示意图：仅从 public/emboss-stamps/<n>.png 读取，无文件时显示编号占位。
 * 不参与导入/保存逻辑，仅辅助人工核对。
 */
export function EmbossStampReferencePanel({ className = '' }: Props) {
  const ids = embossStampIds();

  return (
    <div
      className={`rounded-lg border border-amber-200/90 bg-gradient-to-b from-amber-50/90 to-amber-50/40 p-3 ${className}`}
    >
      <p className="text-xs font-semibold text-amber-950/90">压唛填写方式</p>
      <p className="mt-1 text-[11px] leading-relaxed text-amber-900/85">
        每行一条：<span className="rounded bg-white/90 px-1 font-mono text-[11px]">编号#，位置</span>
        ；同一编号要压多次时写{' '}
        <span className="rounded bg-white/90 px-1 font-mono text-[11px]">*次数</span>。
        示例：
        <span className="ml-1 font-mono text-[11px] text-gray-800">4#，内唛</span>、
        <span className="font-mono text-[11px] text-gray-800">1#，盖面*2</span>
        （表示 1# 在盖面压 2 次）。
      </p>
      <p className="mt-2 text-[10px] text-gray-500">
        下图仅作编号对照，系统不读取图片；请将各编号实物图放在网站目录{' '}
        <code className="rounded bg-white/80 px-0.5 text-[10px]">public/emboss-stamps/1.png</code> … 无图时只显示编号。
      </p>
      <div className="mt-2 flex max-h-52 flex-wrap gap-2 overflow-y-auto overscroll-contain rounded-md border border-amber-100/80 bg-white/50 p-2">
        {ids.map((id) => (
          <EmbossStampThumb key={id} id={id} />
        ))}
      </div>
    </div>
  );
}

function EmbossStampThumb({ id }: { id: string }) {
  const [failed, setFailed] = useState(false);
  const onErr = useCallback(() => setFailed(true), []);
  const src = `/emboss-stamps/${id}.png`;

  return (
    <div className="flex w-[76px] shrink-0 flex-col items-center gap-0.5">
      <div className="relative h-16 w-full overflow-hidden rounded border border-gray-200/90 bg-gray-50 shadow-sm">
        {!failed ? (
          // eslint-disable-next-line @next/next/no-img-element -- 动态本地静态资源，无固定尺寸图集
          <img
            src={src}
            alt={`压唛 ${id}#`}
            className="h-full w-full object-contain"
            loading="lazy"
            onError={onErr}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] font-semibold tabular-nums text-gray-500">
            {id}#
          </div>
        )}
      </div>
      <span className="text-[10px] font-medium tabular-nums text-gray-600">{id}#</span>
    </div>
  );
}
