"use client"

import { useEffect, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { Clock, MessageSquare, PlusCircle, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { repairApi, tokenStore } from "@/lib/api"
import type { Session } from "@/types/repair"
import { cn } from "@/lib/utils"

interface Props {
  activeSessionId: string | null
  onSelectSession: (session: Session) => void
  onNewSession: () => void
}

export default function SessionSidebar({ activeSessionId, onSelectSession, onNewSession }: Props) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Only fetch sessions if user is authenticated
    const token = tokenStore.get()
    if (!token) return

    setLoading(true)
    repairApi
      .listSessions()
      .then(setSessions)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <aside className="w-64 border-r flex flex-col h-full bg-gray-50">
      <div className="p-3 border-b">
        <Button onClick={onNewSession} variant="outline" size="sm" className="w-full gap-2">
          <PlusCircle className="h-4 w-4" />
          New Repair Session
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          <p className="text-xs font-medium text-gray-400 px-2 py-1.5 uppercase tracking-wider">
            History
          </p>

          {loading &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-2 py-2 space-y-1.5">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-2 w-1/2" />
              </div>
            ))}

          {!loading && sessions.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-gray-400">
              <MessageSquare className="h-6 w-6 opacity-40" />
              <p className="text-xs">No sessions yet</p>
            </div>
          )}

          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => onSelectSession(session)}
              className={cn(
                "w-full text-left px-2 py-2.5 rounded-md hover:bg-gray-100 transition-colors",
                activeSessionId === session.id && "bg-gray-100 font-medium"
              )}
            >
              <div className="flex items-start gap-2">
                <Wrench className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs text-gray-800 truncate">
                    {session.title ?? "Untitled session"}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock className="h-2.5 w-2.5 text-gray-400" />
                    <p className="text-[10px] text-gray-400">
                      {formatDistanceToNow(new Date(session.updated_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </aside>
  )
}