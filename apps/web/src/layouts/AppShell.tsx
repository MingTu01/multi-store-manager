import { Outlet, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { ToastContainer } from "../components/Toast";
import { NotificationBadge } from "../components/NotificationBadge";
import { api } from "../lib/api";
import { Bell } from "lucide-react";

export function AppShell() {
  const nav = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const fetch = () => api.get('/notifications/unread-count').then((d: any) => setUnreadCount(d.count || 0)).catch(() => {});
    fetch();
    const t = setInterval(fetch, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 to-indigo-50/30">
      <ToastContainer />
      <Sidebar />
      <main className="overflow-x-hidden pb-20 lg:pl-64 lg:pb-6">
        {/* Top right notification bell */}
        <div className="fixed top-4 right-4 z-50 lg:top-6 lg:right-6">
          <button onClick={() => nav('/notifications')}
            className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/80 shadow-lg backdrop-blur-sm transition-all hover:bg-white hover:shadow-xl">
            <Bell className="h-5 w-5 text-slate-600" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        </div>
        <div className="mx-auto max-w-5xl px-4 py-4 lg:px-6 lg:py-6">
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  );
}