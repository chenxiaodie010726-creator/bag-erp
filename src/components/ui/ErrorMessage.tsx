/* ============================================================
 * 错误提示组件
 * 说明: 当接口报错或数据加载失败时，显示友好的中文提示
 * 用法: <ErrorMessage message="加载订单失败" />
 * ============================================================ */

interface ErrorMessageProps {
  message: string;       // 错误提示文字
  onRetry?: () => void;  // 可选的重试按钮回调
}

export default function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      {/* 错误图标 */}
      <div className="text-4xl">⚠️</div>

      {/* 错误信息 */}
      <p className="text-gray-600 text-sm">{message}</p>

      {/* 重试按钮（仅当传入 onRetry 时显示） */}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 px-4 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 transition-colors"
        >
          重试
        </button>
      )}
    </div>
  );
}
