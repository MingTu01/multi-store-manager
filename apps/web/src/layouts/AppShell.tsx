import { Outlet, Navigate, useParams } from "react-router-dom";
import { useStore } from "../stores/data";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { ToastContainer } from "../components/Toast";

export function AppShell() {
  const user = useStore((s: any) => s.user);
  const { storeId } = useParams();
  
  if (user && user.role !== "ADMIN" && !storeId && user.store_id) {
    return <Navigate to={"/store/" + user.store_id} replace />;
  }
  
  const showAdminNav = !storeId || user?.role === "ADMIN";
  
  return (
    <div className="min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 to-indigo-50/30" data-readonly={user?.role === "SHAREHOLDER" ? "true" : undefined}>
      <ToastContainer />
      {showAdminNav && <Sidebar />}
      <main className={`overflow-x-hidden pb-20 ${showAdminNav ? "lg:pl-64" : ""} lg:pb-6`}>
        <div className="mx-auto max-w-5xl px-4 py-4 lg:px-6 lg:py-6">
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  );
}