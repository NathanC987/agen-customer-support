"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const DEMO_ACCOUNTS = [
  { email: "admin@nimbus.example", password: "Admin@1234", who: "Admin — tickets, dashboard, inventory, KB" },
  { email: "priya.sharma@example.com", password: "Demo@1234", who: "Priya — wrong item delivered" },
  { email: "marcus.chen@example.com", password: "Demo@1234", who: "Marcus — payment failed, money deducted" },
  { email: "sofia.alvarez@example.com", password: "Demo@1234", who: "Sofia — locked out" },
  { email: "john.doe@example.com", password: "Demo@1234", who: "John — Premium not activated" },
  { email: "liam.obrien@example.com", password: "Demo@1234", who: "Liam — unrecognised charges" },
  { email: "aisha.khan@example.com", password: "Demo@1234", who: "Aisha — cancel order & upgrade" },
  { email: "alex.morgan@example.com", password: "Demo@1234", who: "Alex — blank customer" },
];

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "signup" ? { name, email, password } : { email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      const next = new URLSearchParams(window.location.search).get("next");
      const home = data.role === "admin" ? "/dashboard" : "/chat";
      // only follow same-site relative paths (no open redirects)
      window.location.assign(next && next.startsWith("/") && !next.startsWith("//") ? next : home);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center bg-grid px-4 py-10">
      <div className="w-full max-w-md space-y-5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
            <Sparkles className="size-4" />
          </span>
          <div>
            <p className="font-semibold leading-tight">Nimbus Support</p>
            <p className="text-xs text-muted-foreground">{mode === "login" ? "Sign in to continue" : "Create your customer account"}</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
            {mode === "signup" && <p className="text-[11px] text-muted-foreground">At least 8 characters, with letters and numbers.</p>}
          </div>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {mode === "login" ? "Sign in" : "Create account"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {mode === "login" ? (
              <>New customer? <Link href="/signup" className="font-medium text-primary hover:underline">Create an account</Link></>
            ) : (
              <>Already have an account? <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link></>
            )}
          </p>
        </form>

        {mode === "login" && (
          <div className="rounded-2xl border bg-card/60 p-4">
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Demo accounts (click to fill)</p>
            <ul className="space-y-1">
              {DEMO_ACCOUNTS.map((a) => (
                <li key={a.email}>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(a.email);
                      setPassword(a.password);
                    }}
                    className="flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
                  >
                    <span className="font-mono">{a.email}</span>
                    <span className="truncate text-muted-foreground">{a.who}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 px-2 text-[11px] text-muted-foreground">Passwords: admin <code>Admin@1234</code>, customers <code>Demo@1234</code></p>
          </div>
        )}
      </div>
    </div>
  );
}
