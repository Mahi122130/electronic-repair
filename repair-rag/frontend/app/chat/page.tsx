"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { tokenStore } from "@/lib/api"
import type { Session } from "@/types/repair"

const RepairChat = dynamic(() => import("@/components/chat/RepairChat"), { ssr: false })
const SessionSidebar = dynamic(() => import("@/components/chat/SessionSidebar"), { ssr: false })

export default function ChatPage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [activeSession, setActiveSession] = useState<Session | null>(null)

  useEffect(() => {
    if (!tokenStore.get()) {
      router.replace("/")
      return
    }
    setMounted(true)
  }, [router])

  const handleLogout = () => {
    tokenStore.clear()
    router.replace("/")
  }

  if (!mounted) return null

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Top navbar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 20px", background: "#111827", color: "white",
        boxShadow: "0 1px 4px rgba(0,0,0,0.2)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "1.2rem" }}>🔧</span>
          <span style={{ fontWeight: 700, fontSize: "1rem" }}>Repair Assistant</span>
        </div>
        <button
          onClick={handleLogout}
          style={{
            background: "#374151", color: "white", border: "none",
            borderRadius: "8px", padding: "6px 14px", cursor: "pointer",
            fontSize: "0.85rem", fontWeight: 500
          }}
        >
          Logout
        </button>
      </div>

      {/* Main content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <SessionSidebar
          activeSessionId={activeSession?.id ?? null}
          onSelectSession={setActiveSession}
          onNewSession={() => setActiveSession(null)}
        />
        <main style={{ flex: 1, overflow: "auto", padding: "24px", background: "#f9fafb" }}>
          <RepairChat
            key={activeSession?.id ?? "new"}
            initialSessionId={activeSession?.id}
            deviceType={activeSession?.device_type ?? undefined}
          />
        </main>
      </div>
    </div>
  )
}