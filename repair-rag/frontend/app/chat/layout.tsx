"use client";

/**
 * app/chat/layout.tsx
 * ────────────────────
 * Protects the chat routes - redirects to auth if no token is present.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { tokenStore } from "@/lib/api";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    // Check if token exists
    const token = tokenStore.get();
    if (!token) {
      // Redirect to auth if no token
      router.replace("/auth");
    }
  }, [router]);

  // Show loading state while checking auth
  const token = typeof window !== "undefined" ? tokenStore.get() : null;

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
