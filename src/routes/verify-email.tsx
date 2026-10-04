import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/verify-email")({ component: VerifyEmailPage });

function VerifyEmailPage() {
  const { verifyEmail, resendOtp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => setEmail(sessionStorage.getItem("leadpilot.pendingEmail") ?? ""), []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  return (
    <AuthLayout
      title="Verify your email"
      subtitle="Enter the 6-digit code we sent you"
      footer={
        <Link to="/" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setSubmitting(true);
          try {
            await verifyEmail(email, code);
            sessionStorage.removeItem("leadpilot.pendingEmail");
            toast.success("Email verified");
            navigate({ to: "/dashboard" });
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Verification failed.");
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="verify-email">Email</Label>
          <Input
            id="verify-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="code">Verification code</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            className="text-center text-lg tracking-[0.4em]"
            required
          />
        </div>
        <Button className="w-full" disabled={submitting || code.length !== 6}>
          {submitting ? "Verifying…" : "Verify email"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={cooldown > 0 || !email}
          onClick={async () => {
            try {
              await resendOtp(email);
              setCooldown(60);
              toast.success("A new code has been sent.");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not resend code.");
            }
          }}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </Button>
      </form>
    </AuthLayout>
  );
}
