"use client";

/**
 * app/auth/page.tsx
 * ──────────────────
 * Login/Register page for the repair RAG system.
 * Handles user authentication via JWT.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { authApi, tokenStore } from "@/lib/api";

export default function AuthPage() {
  const router = useRouter();

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // Validate inputs
      if (!email || !password) {
        throw new Error("Email and password are required");
      }

      if (!email.includes("@")) {
        throw new Error("Please enter a valid email");
      }

      if (password.length < 6) {
        throw new Error("Password must be at least 6 characters");
      }

      // Call auth endpoint
      const response = isLogin
        ? await authApi.login(email, password)
        : await authApi.register(email, password);

      // Store token
      tokenStore.set(response.access_token);

      // Redirect to chat
      router.push("/chat");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Authentication failed. Please try again.";
      setError(message);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <span className="text-lg font-bold text-primary">⚙️</span>
            </div>
            <h1 className="text-2xl font-bold">Repair RAG</h1>
          </div>
          <CardTitle>{isLogin ? "Sign In" : "Create Account"}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {isLogin
              ? "Access the electronic repair guide assistant"
              : "Create an account to get started"}
          </p>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                autoComplete="email"
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                autoComplete={isLogin ? "current-password" : "new-password"}
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="flex gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Submit button */}
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
              size="lg"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLogin ? "Sign In" : "Create Account"}
            </Button>
          </form>

          {/* Toggle mode */}
          <div className="mt-6 pt-6 border-t flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              {isLogin ? "Don't have an account?" : "Already have an account?"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsLogin(!isLogin);
                setError(null);
              }}
              disabled={isLoading}
            >
              {isLogin ? "Sign Up" : "Sign In"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}