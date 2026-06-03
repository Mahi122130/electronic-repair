/**
 * components/chat/ChatWorkspaceComponent.tsx
 * ──────────────────────────────────────────
 * Main visual workspace presentation layer.
 */

"use client";

import { useState } from "react";
import RepairChat from "@/components/chat/RepairChat";
import SessionSidebar from "@/components/chat/SessionSidebar";
import type { Session } from "@/types/repair";

export default function ChatWorkspaceComponent() {
  const [activeSession, setActiveSession] = useState<Session | null>(null);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      <SessionSidebar
        activeSessionId={activeSession?.id ?? null}
        onSelectSession={setActiveSession}
        onNewSession={() => setActiveSession(null)}
      />
      <main className="flex-1 flex items-start justify-center p-6 overflow-auto bg-background">
        <RepairChat
          key={activeSession?.id ?? "new"} // Remounts cleanly on workspace swap
          initialSessionId={activeSession?.id}
          deviceType={activeSession?.device_type ?? undefined}
        />
      </main>
    </div>
  );
}