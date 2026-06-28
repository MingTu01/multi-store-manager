import { useState, useCallback, useRef } from 'react';
import { Modal } from './Modal';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

/**
 * 自定义确认弹窗 hook，替代原生 window.confirm()
 *
 * 用法：
 *   const { confirm, ConfirmDialog } = useConfirm();
 *
 *   // 在组件 JSX 中渲染
 *   <ConfirmDialog />
 *
 *   // 在事件处理中调用
 *   const ok = await confirm({ message: '确认删除？' });
 *   if (!ok) return;
 */
export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    // 如果已有弹窗在显示，先拒绝旧的
    if (pendingRef.current) {
      pendingRef.current.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      const item: PendingConfirm = { ...opts, resolve };
      pendingRef.current = item;
      setPending(item);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (pendingRef.current) {
      pendingRef.current.resolve(true);
      pendingRef.current = null;
    }
    setPending(null);
  }, []);

  const handleCancel = useCallback(() => {
    if (pendingRef.current) {
      pendingRef.current.resolve(false);
      pendingRef.current = null;
    }
    setPending(null);
  }, []);

  function ConfirmDialog() {
    return (
      <Modal
        open={!!pending}
        onClose={handleCancel}
        title={pending?.title || '确认操作'}
      >
        <div className="space-y-5">
          <p className="text-sm leading-relaxed text-slate-600">
            {pending?.message}
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              className="action-btn flex-1 rounded-xl border border-slate-200 py-2.5 text-sm text-slate-600 hover:bg-slate-50 active:scale-[0.98]"
            >
              {pending?.cancelText || '取消'}
            </button>
            <button
              onClick={handleConfirm}
              className={
                'action-btn flex-1 rounded-xl py-2.5 text-sm font-medium text-white active:scale-[0.98] ' +
                (pending?.danger !== false
                  ? 'bg-rose-500 hover:bg-rose-600'
                  : 'bg-indigo-500 hover:bg-indigo-600')
              }
            >
              {pending?.confirmText || '确定'}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return { confirm, ConfirmDialog };
}
