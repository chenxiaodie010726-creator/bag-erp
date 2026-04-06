/* ============================================================
 * 加载中组件
 * 说明: 数据加载时显示的 loading 动画
 * 用法: <Loading />  或  <Loading text="正在加载订单..." />
 * ============================================================ */

interface LoadingProps {
  text?: string;  // 可选的加载提示文字
}

export default function Loading({ text = '加载中...' }: LoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      {/* 旋转动画圆圈 */}
      <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
      <p className="text-gray-500 text-sm">{text}</p>
    </div>
  );
}
