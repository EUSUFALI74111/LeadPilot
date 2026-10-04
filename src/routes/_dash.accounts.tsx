import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Gauge,
  MessageCircleReply,
  Pencil,
  Plus,
  Power,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiError, jsonBody } from "@/lib/api";

export const Route = createFileRoute("/_dash/accounts")({ component: AccountsPage });

type SendingAccount = {
  id: string;
  accountName: string;
  email: string;
  status: string;
  isActive: boolean;
  dailyLimit: number;
  sentToday: number;
  lastTestedAt: string | null;
  lastError: string | null;
  username: string;
  senderName: string;
  host: string;
  port: number;
  encryption: string;
  hourlyLimit: number;
  perMinuteLimit: number;
  sendingInterval: number;
  replyTracking: boolean;
  imapHost: string | null;
  imapPort: number | null;
  imapEncryption: string | null;
  imapUsername: string | null;
  imapLastCheckedAt: string | null;
  imapLastError: string | null;
};

type ProviderKey = "hostinger" | "gmail" | "outlook" | "custom";
const providerPresets: Record<
  ProviderKey,
  {
    label: string;
    host: string;
    port: string;
    encryption: string;
    daily: string;
    hourly: string;
    minute: string;
  }
> = {
  hostinger: {
    label: "Hostinger",
    host: "smtp.hostinger.com",
    port: "465",
    encryption: "ssl",
    daily: "500",
    hourly: "100",
    minute: "10",
  },
  gmail: {
    label: "Gmail / Google Workspace",
    host: "smtp.gmail.com",
    port: "465",
    encryption: "ssl",
    daily: "500",
    hourly: "100",
    minute: "10",
  },
  outlook: {
    label: "Outlook / Microsoft 365",
    host: "smtp.office365.com",
    port: "587",
    encryption: "tls",
    daily: "500",
    hourly: "60",
    minute: "10",
  },
  custom: {
    label: "Custom SMTP",
    host: "",
    port: "587",
    encryption: "tls",
    daily: "500",
    hourly: "100",
    minute: "10",
  },
};

function AccountsPage() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SendingAccount | null>(null);
  const [replyAccount, setReplyAccount] = useState<SendingAccount | null>(null);
  const [testAccount, setTestAccount] = useState<SendingAccount | null>(null);
  const [provider, setProvider] = useState<ProviderKey>("hostinger");
  const [enableSending, setEnableSending] = useState(true);
  const [setupReplies, setSetupReplies] = useState(false);
  const [testEnableSending, setTestEnableSending] = useState(true);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["smtp-accounts"],
    queryFn: () => api<SendingAccount[]>("smtp/accounts.php").then((r) => r.data),
    refetchInterval: 30_000,
  });
  const add = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("smtp/add.php", { method: "POST", body: jsonBody(body) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["smtp-accounts"] });
      setOpen(false);
      toast.success("Test email sent and SMTP account saved securely");
    },
    onError: (reason) =>
      toast.error(
        reason instanceof ApiError && typeof reason.details["diagnostic"] === "string"
          ? `${reason.message} ${reason.details["diagnostic"]}`
          : reason.message,
      ),
  });
  const action = useMutation({
    mutationFn: ({
      path,
      body,
      method = "POST",
    }: {
      path: string;
      body: Record<string, unknown>;
      method?: string;
    }) => api(`smtp/${path}.php`, { method, body: jsonBody(body) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["smtp-accounts"] });
      toast.success("Sending account updated");
    },
    onError: (reason) => toast.error(reason.message),
  });
  const test = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("smtp/test.php", { method: "POST", body: jsonBody(body) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["smtp-accounts"] });
      setTestAccount(null);
      toast.success("Test email delivered and SMTP connection verified");
    },
    onError: (reason) =>
      toast.error(
        reason instanceof ApiError && typeof reason.details["diagnostic"] === "string"
          ? `${reason.message} ${reason.details["diagnostic"]}`
          : reason.message,
      ),
  });
  const replyTracking = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("smtp/reply-tracking.php", { method: "POST", body: jsonBody(body) }),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["smtp-accounts"] });
      setReplyAccount(null);
      toast.success(
        variables["enabled"]
          ? "Inbox tested and reply tracking enabled"
          : "Reply tracking disabled",
      );
    },
    onError: (reason) =>
      toast.error(
        reason instanceof ApiError && typeof reason.details["diagnostic"] === "string"
          ? `${reason.message} ${reason.details["diagnostic"]}`
          : reason.message,
      ),
  });
  const edit = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("smtp/update.php", { method: "PUT", body: jsonBody(body) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["smtp-accounts"] });
      setEditing(null);
      toast.success("Account changes saved. Use Test when you want to verify the connection.");
    },
    onError: (reason) =>
      toast.error(
        reason instanceof ApiError && typeof reason.details["diagnostic"] === "string"
          ? `${reason.message} ${reason.details["diagnostic"]}`
          : reason.message,
      ),
  });

  return (
    <>
      <PageHeader
        title="Sending Accounts"
        description="Credentials are encrypted and never displayed after saving."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" /> Add sending account
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add sending account</DialogTitle>
                <DialogDescription>
                  We authenticate and send a real test email first. Credentials are encrypted and
                  saved only after success.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  add.mutate({
                    ...Object.fromEntries(new FormData(event.currentTarget).entries()),
                    enableSending,
                    replyTracking: setupReplies,
                  });
                }}
              >
                <div className="space-y-2">
                  <Label>Email provider</Label>
                  <Select
                    value={provider}
                    onValueChange={(value) => setProvider(value as ProviderKey)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(providerPresets).map(([key, preset]) => (
                        <SelectItem key={key} value={key}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Provider settings are filled automatically. LeadPilot enforces a maximum of 500
                    sending attempts per account each day.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Account name" name="accountName" placeholder="Primary outreach" />
                  <Field label="Sender name" name="senderName" placeholder="Your name" />
                </div>
                <Field
                  label="Sender email"
                  name="senderEmail"
                  type="email"
                  placeholder="sender@yourdomain.com"
                />
                <div key={provider} className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <p className="font-medium">SMTP connection</p>
                    <p className="text-xs text-muted-foreground">Used only to send email.</p>
                  </div>
                  <Field
                    label="SMTP Server / Host"
                    name="host"
                    placeholder="smtp.yourdomain.com"
                    defaultValue={providerPresets[provider].host}
                  />
                  <Field
                    label="Port"
                    name="port"
                    type="number"
                    defaultValue={providerPresets[provider].port}
                  />
                  <div className="space-y-2">
                    <Label>Security</Label>
                    <Select name="encryption" defaultValue={providerPresets[provider].encryption}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tls">TLS / STARTTLS</SelectItem>
                        <SelectItem value="ssl">SSL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Field label="Username / Email" name="username" />
                  <Field label="Password / App password" name="password" type="password" />
                  <Field
                    label="Test email / Recipient email"
                    name="testEmail"
                    type="email"
                    placeholder="you@company.com"
                  />
                  <div className="sm:col-span-2 border-t pt-3">
                    <p className="flex items-center gap-2 font-medium">
                      <Gauge className="size-4" /> Safe sending limits
                    </p>
                    <p className="text-xs text-muted-foreground">
                      LeadPilot automatically pauses at these limits and resumes when the time
                      window resets. The daily limit cannot exceed 500.
                    </p>
                  </div>
                  <Field
                    label="Daily limit"
                    name="dailyLimit"
                    type="number"
                    defaultValue={providerPresets[provider].daily}
                    max={500}
                  />
                  <Field
                    label="Hourly limit"
                    name="hourlyLimit"
                    type="number"
                    defaultValue={providerPresets[provider].hourly}
                  />
                  <Field
                    label="Per-minute limit"
                    name="perMinuteLimit"
                    type="number"
                    defaultValue={providerPresets[provider].minute}
                  />
                </div>
                <ToggleRow
                  title="Enable campaign sending after test"
                  description="Turn this off to save a verified account without making it available to campaigns."
                  checked={enableSending}
                  onCheckedChange={setEnableSending}
                />
                <ToggleRow
                  title="Enable reply tracking"
                  description="Optional. Tests the inbox through IMAP and securely saves its settings."
                  checked={setupReplies}
                  onCheckedChange={setSetupReplies}
                />
                {setupReplies ? (
                  <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
                    <Field
                      label="IMAP Server / Host"
                      name="imapHost"
                      defaultValue={providerImapHost(provider)}
                    />
                    <Field label="IMAP Port" name="imapPort" type="number" defaultValue="993" />
                    <div className="space-y-2">
                      <Label>IMAP security</Label>
                      <Select name="imapEncryption" defaultValue="ssl">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ssl">SSL</SelectItem>
                          <SelectItem value="tls">TLS</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Field
                      label="IMAP Username"
                      name="imapUsername"
                      placeholder="Usually the full email address"
                    />
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="add-imap-password">IMAP password / App password</Label>
                      <Input
                        id="add-imap-password"
                        name="imapPassword"
                        type="password"
                        placeholder="Leave blank to reuse the SMTP password"
                      />
                    </div>
                  </div>
                ) : null}
                <Button type="submit" className="w-full" disabled={add.isPending}>
                  {add.isPending ? "Testing connection & sending…" : "Test & Save SMTP"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      {query.error ? <ErrorMessage message={query.error.message} /> : null}
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading sending accounts…</p>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-2">
        {(query.data ?? []).map((account) => {
          const limit = Number(account.dailyLimit);
          const sent = Number(account.sentToday);
          const remaining = Math.max(limit - sent, 0);
          const pct = limit ? Math.round((sent * 100) / limit) : 0;
          const ready = account.status === "CONNECTED";
          const sendingEnabled = ready && account.isActive;
          return (
            <div key={account.id} className="surface-card p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{account.email}</p>
                  <p className="text-sm text-muted-foreground">{account.accountName}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <StatusBadge status={smtpStatusLabel(account.status)} className="shrink-0" />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    aria-label={`Delete ${account.email}`}
                    onClick={() =>
                      action.mutate({ path: "delete", body: { id: account.id }, method: "DELETE" })
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <Progress value={pct} className="mt-4 h-2" />
              <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <Metric label="Limit" value={limit} />
                <Metric label="Quota used" value={sent} />
                <Metric label="Remaining" value={remaining} />
              </div>
              <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5" /> Credentials hidden ·{" "}
                {account.lastTestedAt ? `tested ${account.lastTestedAt}` : "not tested"}
              </p>
              {account.lastError ? (
                <p className="mt-2 text-xs text-destructive">{account.lastError}</p>
              ) : null}
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <MessageCircleReply className="size-3.5" /> Reply tracking:{" "}
                {account.replyTracking ? "On" : "Off"}
                {account.imapLastCheckedAt ? ` · checked ${account.imapLastCheckedAt}` : ""}
              </p>
              {account.imapLastError ? (
                <p className="mt-2 text-xs text-destructive">Inbox: {account.imapLastError}</p>
              ) : null}
              <p className="mt-2 text-xs font-medium">
                Sending:{" "}
                {sendingEnabled ? "Enabled" : ready ? "Disabled by you" : "Blocked — test required"}
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2 border-t pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setTestEnableSending(true);
                    setTestAccount(account);
                  }}
                >
                  <Send className="size-4" /> Send test
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setEditing(account)}
                >
                  <Pencil className="size-4" /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    account.replyTracking
                      ? replyTracking.mutate({ id: account.id, enabled: false })
                      : setReplyAccount(account)
                  }
                >
                  <MessageCircleReply className="size-4" />
                  {account.replyTracking ? "Turn replies off" : "Set up replies"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  aria-label={sendingEnabled ? "Disable" : "Enable"}
                  disabled={!ready}
                  onClick={() =>
                    action.mutate({
                      path: "toggle",
                      body: { id: account.id, enabled: !sendingEnabled },
                    })
                  }
                >
                  <Power className="size-4" /> {sendingEnabled ? "Disable" : "Enable"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <Dialog open={Boolean(testAccount)} onOpenChange={(next) => !next && setTestAccount(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test SMTP connection</DialogTitle>
            <DialogDescription>
              Choose exactly where the branded LeadPilot test email should be delivered. A failed
              test blocks campaign sending for safety.
            </DialogDescription>
          </DialogHeader>
          {testAccount ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                const values = Object.fromEntries(new FormData(event.currentTarget).entries());
                test.mutate({ ...values, id: testAccount.id });
              }}
            >
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-medium">From: {testAccount.email}</p>
                <p className="text-xs text-muted-foreground">
                  {testAccount.host}:{testAccount.port} · {testAccount.encryption.toUpperCase()}
                </p>
              </div>
              <Field
                label="Test recipient email"
                name="testEmail"
                type="email"
                placeholder="you@company.com"
              />
              <input type="hidden" name="enableAfterTest" value={testEnableSending ? "1" : "0"} />
              <ToggleRow
                title="Enable campaign sending after a successful test"
                description="Turn this off only if you want the account connected but unavailable to campaigns."
                checked={testEnableSending}
                onCheckedChange={setTestEnableSending}
              />
              <Button type="submit" className="w-full" disabled={test.isPending}>
                {test.isPending ? "Testing and delivering…" : "Send test email"}
              </Button>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(editing)} onOpenChange={(next) => !next && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit sending account</DialogTitle>
            <DialogDescription>
              Editing only saves your changes and does not send another test email. Leave the
              password blank to keep the current encrypted password; use the separate Test button
              whenever you want to verify the connection.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                const values = Object.fromEntries(new FormData(event.currentTarget).entries());
                edit.mutate({ ...values, id: editing.id });
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Account name" name="accountName" defaultValue={editing.accountName} />
                <Field label="Sender name" name="senderName" defaultValue={editing.senderName} />
                <Field
                  label="Sender email"
                  name="senderEmail"
                  type="email"
                  defaultValue={editing.email}
                />
                <Field label="SMTP Server / Host" name="host" defaultValue={editing.host} />
                <Field label="Port" name="port" type="number" defaultValue={String(editing.port)} />
                <div className="space-y-2">
                  <Label>Security</Label>
                  <Select name="encryption" defaultValue={editing.encryption}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tls">TLS / STARTTLS</SelectItem>
                      <SelectItem value="ssl">SSL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Field label="Username / Email" name="username" defaultValue={editing.username} />
                <div className="space-y-2">
                  <Label htmlFor="edit-smtp-password">New password / App password</Label>
                  <Input
                    id="edit-smtp-password"
                    name="password"
                    type="password"
                    placeholder="Leave blank to keep current password"
                  />
                </div>
                <Field
                  label="Daily limit"
                  name="dailyLimit"
                  type="number"
                  defaultValue={String(editing.dailyLimit)}
                  max={500}
                />
                <Field
                  label="Hourly limit"
                  name="hourlyLimit"
                  type="number"
                  defaultValue={String(editing.hourlyLimit)}
                />
                <Field
                  label="Per-minute limit"
                  name="perMinuteLimit"
                  type="number"
                  defaultValue={String(editing.perMinuteLimit)}
                />
              </div>
              {editing.replyTracking ? (
                <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                  If you change the App Password, open Replies afterward and update/test the IMAP
                  password too.
                </p>
              ) : null}
              <Button type="submit" className="w-full" disabled={edit.isPending}>
                {edit.isPending ? "Saving changes…" : "Save changes"}
              </Button>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(replyAccount)} onOpenChange={(next) => !next && setReplyAccount(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure reply tracking</DialogTitle>
            <DialogDescription>
              LeadPilot connects to this account’s inbox in read-only mode and matches replies using
              the original email Message-ID. The password is encrypted and never returned by the
              API.
            </DialogDescription>
          </DialogHeader>
          {replyAccount ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                const values = Object.fromEntries(new FormData(event.currentTarget).entries());
                replyTracking.mutate({ ...values, id: replyAccount.id, enabled: true });
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="IMAP Server / Host"
                  name="imapHost"
                  defaultValue={replyAccount.imapHost ?? suggestedImapHost(replyAccount.email)}
                />
                <Field
                  label="IMAP Port"
                  name="imapPort"
                  type="number"
                  defaultValue={String(replyAccount.imapPort ?? 993)}
                />
                <div className="space-y-2">
                  <Label>Security</Label>
                  <Select name="imapEncryption" defaultValue={replyAccount.imapEncryption ?? "ssl"}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ssl">SSL</SelectItem>
                      <SelectItem value="tls">TLS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Field
                  label="IMAP Username"
                  name="imapUsername"
                  defaultValue={replyAccount.imapUsername ?? replyAccount.username}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="imap-password">IMAP password / App password</Label>
                <Input
                  id="imap-password"
                  name="imapPassword"
                  type="password"
                  placeholder="Leave blank to reuse the encrypted SMTP password"
                />
                <p className="text-xs text-muted-foreground">
                  For Gmail, use an App Password. The normal Google password will not work.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {replyAccount.replyTracking ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={replyTracking.isPending}
                    onClick={() => replyTracking.mutate({ id: replyAccount.id, enabled: false })}
                  >
                    Disable tracking
                  </Button>
                ) : null}
                <Button type="submit" disabled={replyTracking.isPending}>
                  {replyTracking.isPending ? "Testing inbox…" : "Test & enable replies"}
                </Button>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
function suggestedImapHost(email: string) {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (domain === "gmail.com" || domain === "googlemail.com") return "imap.gmail.com";
  if (domain) return `imap.${domain}`;
  return "imap.yourdomain.com";
}

function smtpStatusLabel(status: string) {
  if (status === "CONNECTED") return "Connected";
  if (status === "UNTESTED") return "Needs test";
  if (status === "TESTING") return "Testing";
  if (status === "ERROR") return "Error";
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

function providerImapHost(provider: ProviderKey) {
  if (provider === "gmail") return "imap.gmail.com";
  if (provider === "outlook") return "outlook.office365.com";
  if (provider === "hostinger") return "imap.hostinger.com";
  return "imap.yourdomain.com";
}

function ToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={title} />
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  defaultValue,
  max,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
  max?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`smtp-${name}`}>{label}</Label>
      <Input
        id={`smtp-${name}`}
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        required
        min={type === "number" ? 1 : undefined}
        max={type === "number" ? max : undefined}
      />
    </div>
  );
}
function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
function ErrorMessage({ message, compact = false }: { message: string; compact?: boolean }) {
  return (
    <div
      className={`rounded-xl border border-destructive/30 bg-destructive/10 text-destructive ${compact ? "mt-2 p-2 text-xs" : "p-4 text-sm"}`}
    >
      <span className="flex items-start gap-1.5">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {message}
      </span>
    </div>
  );
}
