import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, MailCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AuthLayout } from "@/components/auth-layout";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, jsonBody } from "@/lib/api";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPasswordPage });

function ForgotPasswordPage() {
  const [step, setStep] = useState<"email" | "code" | "password" | "done">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Use a short-lived code sent to your email"
      footer={
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
        >
          <ArrowLeft className="size-4" /> Back to sign in
        </Link>
      }
    >
      {step === "email" ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api(
                "auth/forgot-password.php",
                { method: "POST", body: jsonBody({ email }) },
                false,
              );
              setStep("code");
              toast.success("If the account exists, a code has been sent.");
            });
          }}
        >
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Button className="w-full" disabled={busy}>
            {busy ? "Sending…" : "Send reset code"}
          </Button>
        </form>
      ) : null}
      {step === "code" ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const result = await api<{ resetToken: string }>(
                "auth/verify-reset-otp.php",
                { method: "POST", body: jsonBody({ email, code }) },
                false,
              );
              setResetToken(result.data.resetToken);
              setStep("password");
            });
          }}
        >
          <Field label="6-digit code">
            <Input
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="text-center text-lg tracking-[0.4em]"
              required
            />
          </Field>
          <Button className="w-full" disabled={busy || code.length !== 6}>
            Verify code
          </Button>
        </form>
      ) : null}
      {step === "password" ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (password !== confirm) {
              toast.error("Passwords do not match.");
              return;
            }
            run(async () => {
              await api(
                "auth/reset-password.php",
                { method: "POST", body: jsonBody({ email, resetToken, password }) },
                false,
              );
              setStep("done");
            });
          }}
        >
          <Field label="New password">
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={12}
              required
            />
          </Field>
          <Field label="Confirm password">
            <PasswordInput
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={12}
              required
            />
          </Field>
          <Button className="w-full" disabled={busy}>
            {busy ? "Updating…" : "Update password"}
          </Button>
        </form>
      ) : null}
      {step === "done" ? (
        <div className="flex flex-col items-center py-4 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-success/12 text-success">
            <MailCheck className="size-6" />
          </div>
          <p className="mt-4 font-medium">Password updated</p>
          <Button asChild className="mt-5">
            <Link to="/">Sign in</Link>
          </Button>
        </div>
      ) : null}
    </AuthLayout>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
