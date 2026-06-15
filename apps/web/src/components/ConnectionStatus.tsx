import { useSSE, type ConnectionStatus as SSEStatus } from '../lib/sse';

const statusConfig: Record<SSEStatus, { label: string; color: string; dotColor: string; animate: string }> = {
  connected: {
    label: '',
    color: 'text-emerald-600',
    dotColor: 'bg-emerald-500',
    animate: 'animate-pulse',
  },
  connecting: {
    label: '',
    color: 'text-amber-500',
    dotColor: 'bg-amber-400',
    animate: 'animate-pulse',
  },
  disconnected: {
    label: '',
    color: 'text-rose-500',
    dotColor: 'bg-rose-500',
    animate: '',
  },
};

export function ConnectionStatus() {
  const status = useSSE();
  const config = statusConfig[status];

  return (
    <span className={`inline-flex items-center gap-1.5 ${config.color}`} title={status === 'connected' ? '服务器已连接' : status === 'connecting' ? '正在连接...' : '连接断开'}>
      <span className={`relative flex h-2.5 w-2.5 ${status === 'connected' ? config.animate : ''}`}>
        <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${config.dotColor} ${status === 'connected' ? 'animate-ping' : ''}`} />
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${config.dotColor}`} />
      </span>
    </span>
  );
}

export default ConnectionStatus;
