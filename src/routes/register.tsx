import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AuthLayout } from "@/components/auth-layout";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create your account — LeadPilot" },
      {
        name: "description",
        content: "Create a LeadPilot account and start managing leads and email campaigns.",
      },
      { property: "og:title", content: "Create your account — LeadPilot" },
      {
        property: "og:description",
        content: "Create a LeadPilot account and start managing leads and email campaigns.",
      },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const name = String(fields.get("name") ?? "").trim();
    const company = String(fields.get("company") ?? "").trim();
    const email = String(fields.get("email") ?? "").trim();
    const password = String(fields.get("password") ?? "");
    const confirm = String(fields.get("confirm") ?? "");

    if (name.length < 2) return void toast.error("Please enter your full name.");
    if (company.length < 2) return void toast.error("Please enter your business or company name.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return void toast.error("Enter a valid email.");
    if (password.length < 12) return void toast.error("Password must be at least 12 characters.");
    if (password !== confirm) return void toast.error("Passwords do not match.");
    if (!fields.has("terms")) return void toast.error("Please accept the terms to continue.");

    setSubmitting(true);
    try {
      await register(name, company, email, password, confirm);
      sessionStorage.setItem("leadpilot.pendingEmail", email);
      toast.success("Account created. Check your email for the verification code.");
      navigate({ to: "/verify-email" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Set up your workspace in under a minute"
      footer={
        <>
          Already have an account?{" "}
          <Link to="/" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            name="name"
            placeholder="Zahirul Islam"
            autoComplete="name"
            maxLength={100}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="company">Business / company name</Label>
          <Input
            id="company"
            name="company"
            placeholder="Northwind Labs"
            autoComplete="organization"
            maxLength={120}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            maxLength={255}
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              name="password"
              placeholder="••••••••"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <PasswordInput
              id="confirm"
              name="confirm"
              placeholder="••••••••"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input
            name="terms"
            type="checkbox"
            required
            className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
          />
          I agree to the Terms of Service and Privacy Policy
        </label>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
