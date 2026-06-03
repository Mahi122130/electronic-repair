"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { authApi, tokenStore } from "@/lib/api"

export default function HomePage() {
  const router = useRouter()
  // ← Default is now REGISTER not login
  const [isLogin, setIsLogin] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (tokenStore.get()) {
      router.replace("/chat")
    }
  }, [router])

  if (!mounted) return null

  const handleSubmit = async () => {
    if (!email || !password) return
    setError("")
    setLoading(true)
    try {
      const result = isLogin
        ? await authApi.login(email, password)
        : await authApi.register(email, password)
      tokenStore.set(result.access_token)
      router.replace("/chat")
    } catch (err: any) {
      setError(err.message ?? "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#f9fafb",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <div style={{
        background: "white",
        padding: "2rem",
        borderRadius: "16px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        width: "100%",
        maxWidth: "420px",
      }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🔧</div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0 }}>
            Repair Assistant
          </h1>
          <p style={{ color: "#6b7280", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            AI-powered electronics repair help
          </p>
        </div>

        <div style={{
          display: "flex",
          background: "#f3f4f6",
          borderRadius: "10px",
          padding: "4px",
          marginBottom: "1.5rem",
        }}>
          {(["Register", "Login"] as const).map((tab) => {
            const active = tab === "Register" ? !isLogin : isLogin
            return (
              <button
                key={tab}
                onClick={() => { setIsLogin(tab === "Login"); setError("") }}
                style={{
                  flex: 1, padding: "8px", border: "none",
                  borderRadius: "8px", fontWeight: 600,
                  fontSize: "0.875rem", cursor: "pointer",
                  background: active ? "white" : "transparent",
                  color: active ? "#111827" : "#6b7280",
                  boxShadow: active ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                }}
              >
                {tab}
              </button>
            )
          })}
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "6px", color: "#374151" }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{
              width: "100%", padding: "10px 12px",
              border: "1px solid #d1d5db", borderRadius: "8px",
              fontSize: "0.95rem", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: "1.25rem" }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "6px", color: "#374151" }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder="••••••••"
            style={{
              width: "100%", padding: "10px 12px",
              border: "1px solid #d1d5db", borderRadius: "8px",
              fontSize: "0.95rem", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {error && (
          <div style={{
            background: "#fef2f2", border: "1px solid #fecaca",
            color: "#dc2626", padding: "10px 12px",
            borderRadius: "8px", fontSize: "0.875rem", marginBottom: "1rem",
          }}>
            ⚠️ {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !email || !password}
          style={{
            width: "100%", padding: "11px",
            background: loading || !email || !password ? "#9ca3af" : "#111827",
            color: "white", border: "none", borderRadius: "8px",
            fontSize: "1rem", fontWeight: 600,
            cursor: loading || !email || !password ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Please wait..." : isLogin ? "Login →" : "Create Account →"}
        </button>

        <p style={{ textAlign: "center", fontSize: "0.8rem", color: "#9ca3af", marginTop: "1rem" }}>
          {isLogin ? "No account? " : "Already have an account? "}
          <button
            onClick={() => { setIsLogin(!isLogin); setError("") }}
            style={{ background: "none", border: "none", color: "#6366f1", cursor: "pointer", fontWeight: 600 }}
          >
            {isLogin ? "Register here" : "Login instead"}
          </button>
        </p>
      </div>
    </div>
  )
}