import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";

export function AppShell() {
  return (
    <div className="min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 to-indigo-50/30">
      <Sidebar />
      <main className="overflow-x-hidden pb-20 lg:pl-64 lg:pb-6">
        <div className="mx-auto max-w-5xl px-4 py-4 lg:px-6 lg:py-6">
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  );
}