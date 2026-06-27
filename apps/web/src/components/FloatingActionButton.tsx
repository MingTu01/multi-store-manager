import { Plus } from 'lucide-react';

export function FloatingActionButton({ onClick, icon: Icon, label }: { onClick: () => void; icon?: any; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="fixed right-4 bottom-24 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500 text-white shadow-xl transition-all hover:bg-indigo-600 active:scale-95 lg:hidden"
      title={label}
    >
      {Icon ? <Icon className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
    </button>
  );
}