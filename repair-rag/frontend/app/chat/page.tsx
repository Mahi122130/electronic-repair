"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { tokenStore } from "@/lib/api";
import type { Session } from "@/types/repair";
import { Menu } from "lucide-react"; // Imported for mobile sidebar toggling if needed

const RepairChat = dynamic(() => import("@/components/chat/RepairChat"), { ssr: false });
const SessionSidebar = dynamic(() => import("@/components/chat/SessionSidebar"), { ssr: false });

export default function ChatPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (!tokenStore.get()) {
      router.replace("/");
      return;
    }
    setMounted(true);
  }, [router]);

  const handleLogout = () => {
    tokenStore.clear();
    router.replace("/");
  };

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#f9fafb]">
      {/* Top navbar */}
      <div className="flex items-center justify-between px-4 py-3 md:px-5 bg-[#111827] color-white text-white shadow-md z-20 shrink-0">
        <div className="flex items-center gap-2">
          {/* Mobile Sidebar Toggle Button */}
          <button 
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            className="p-1 mr-1 rounded bg-[#374151] block md:hidden hover:bg-gray-700 transition-colors"
            title="Toggle Sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-lg md:text-xl">🔧</span>
          <span className="font-bold text-sm md:text-base whitespace-nowrap">Repair Assistant</span>
        </div>
        <button
          onClick={handleLogout}
          className="bg-[#374151] hover:bg-gray-700 transition-colors text-white border-none rounded-lg px-3 py-1.5 md:px-3.5 md:py-1.5 cursor-pointer text-xs md:text-sm font-medium"
        >
          Logout
        </button>
      </div>

      {/* Main content wrapper */}
      <div className="flex flex-1 relative overflow-hidden">
        
        {/* Desktop Sidebar Sidebar View */}
        <div className="hidden md:block border-r shrink-0 h-full">
          <SessionSidebar
            activeSessionId={activeSession?.id ?? null}
            onSelectSession={setActiveSession}
            onNewSession={() => setActiveSession(null)}
          />
        </div>

        {/* Mobile Sidebar Overlay/Drawer View */}
        {isMobileSidebarOpen && (
          <>
            <div 
              className="fixed inset-0 bg-black/50 z-30 md:hidden" 
              onClick={() => setIsMobileSidebarOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 w-72 bg-white z-40 md:hidden shadow-xl animate-in slide-in-from-left duration-200">
              <div className="h-full pt-16" onClick={() => setIsMobileSidebarOpen(false)}>
                <SessionSidebar
                  activeSessionId={activeSession?.id ?? null}
                  onSelectSession={setActiveSession}
                  onNewSession={() => setActiveSession(null)}
                />
              </div>
            </div>
          </>
        )}

        {/* Dynamic Chat Pane Container */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#f9fafb] w-full">
          <RepairChat
            key={activeSession?.id ?? "new"}
            initialSessionId={activeSession?.id}
            deviceType={activeSession?.device_type ?? undefined}
          />
        </main>
      </div>
    </div>
  );
}