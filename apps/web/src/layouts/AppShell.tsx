import { Outlet, Navigate, useParams } from "react-router-dom";
import { useStore } from "../stores/data";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { ToastContainer } from "../components/Toast";
import { BrowserPushPrompt } from "../components/BrowserPushPrompt";
import { useUnreadPolling } from "../hooks/useUnreadPolling";

export function AppShell() {
  const user = useStore((s: any) => s.user);
  const { storeId } = useParams();
  useUnreadPolling();
  
  if (user && (user as any).role !== "ADMIN" && !storeId && (user as any).store_id) {
    return <Navigate to={"/store/" + (user as any).store_id} replace />;
  }
  
  const showAdminNav = !storeId || user?.role === "ADMIN";
  
  return (
    <div className="min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 to-indigo-50/30 pt-[env(safe-area-inset-top,0px)]" data-readonly={user?.role === "SHAREHOLDER" ? "true" : undefined}>
      <ToastContainer />
      <BrowserPushPrompt />
      {showAdminNav && <Sidebar />}
      <main className={`overflow-x-hidden pb-[calc(5rem+env(safe-area-inset-bottom,0px))] ${showAdminNav ? "lg:pl-64" : ""} lg:pb-6`}>
        <div className="mx-auto max-w-5xl px-4 py-4 lg:px-6 lg:py-6">
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  );
}