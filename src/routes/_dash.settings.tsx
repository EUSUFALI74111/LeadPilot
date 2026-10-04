import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { useMutation, useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/page-header";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { api, jsonBody } from "@/lib/api";

export const Route = createFileRoute("/_dash/settings")({
  head: () => ({
    meta: [
      { title: "Settings — LeadPilot" },
      { name: "description", content: "Profile, security, email and import preferences." },
      { property: "og:title", content: "Settings — LeadPilot" },
      { property: "og:description", content: "Profile, security, email and import preferences." },
    ],
  }),
  component: SettingsPage,
});

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-card p-5">
      <h2 className="font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="mt-5 space-y-4">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  defaultChecked,
}: {
  label: string;
  hint: string;
  defaultChecked?: boolean | undefined;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <Switch defaultChecked={defaultChecked ?? false} />
    </div>
  );
}

function SettingsPage() {
  const { user } = useAuth();
  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api("settings.php", { method: "PUT", body: jsonBody(payload) }),
    onSuccess: () => toast.success("Settings saved"),
    onError: (reason) => toast.error(reason.message),
  });
  const passwordMutation = useMutation({
    mutationFn: () =>
      api("auth/change-password.php", {
        method: "POST",
        body: jsonBody({
          currentPassword: (document.getElementById("s-current") as HTMLInputElement)?.value,
          newPassword: (document.getElementById("s-new") as HTMLInputElement)?.value,
          logoutOtherSessions: true,
        }),
      }),
    onSuccess: () => toast.success("Password updated"),
    onError: (reason) => toast.error(reason.message),
  });
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () =>
      api<
        Array<{ id: number; userAgent: string; ip: string; lastUsedAt: string; current: boolean }>
      >("auth/sessions.php").then((r) => r.data),
  });
  const value = (id: string) =>
    (document.getElementById(id) as HTMLInputElement | null)?.value ?? "";

  return (
    <>
      <PageHeader title="Settings" description="Manage your workspace configuration." />

      <Tabs defaultValue="profile">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <Section title="Profile" description="How your name appears across the workspace.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="p-name">Full name</Label>
                <Input id="p-name" defaultValue={user?.name} maxLength={100} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-email">Email</Label>
                <Input id="p-email" defaultValue={user?.email} maxLength={255} readOnly />
              </div>
            </div>
            <Button onClick={() => saveMutation.mutate({ profile: { name: value("p-name") } })}>
              Save profile
            </Button>
          </Section>
        </TabsContent>

        <TabsContent value="account" className="mt-4">
          <Section title="Account" description="Workspace identity and locale.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="a-workspace">Workspace name</Label>
                <Input id="a-workspace" defaultValue={user?.tenant.name} maxLength={100} />
              </div>
              <div className="space-y-2">
                <Label>Time zone</Label>
                <Select name="timezone" defaultValue="Asia/Dhaka">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Asia/Dhaka">Asia/Dhaka (UTC+6)</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="Europe/London">Europe/London</SelectItem>
                    <SelectItem value="America/New_York">America/New_York</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              onClick={() =>
                saveMutation.mutate({
                  company: {
                    name: value("a-workspace"),
                    timezone:
                      (document.querySelector('[name="timezone"]') as HTMLSelectElement | null)
                        ?.value ?? "UTC",
                  },
                })
              }
            >
              Save account
            </Button>
          </Section>
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <Section title="Security" description="Change the password used to sign in.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="s-current">Current password</Label>
                <PasswordInput id="s-current" maxLength={128} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-new">New password</Label>
                <PasswordInput id="s-new" maxLength={128} />
              </div>
            </div>
            <Toggle
              label="Sign out other sessions"
              hint="End every other active session after changing the password."
            />
            <div className="space-y-2">
              <p className="text-sm font-medium">Active sessions</p>
              {(sessions.data ?? []).map((session) => (
                <div key={session.id} className="rounded-lg border border-border p-3 text-sm">
                  <p>
                    {session.userAgent || "Unknown device"}
                    {session.current ? " · This device" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {session.ip} · {session.lastUsedAt}
                  </p>
                </div>
              ))}
            </div>
            <Button onClick={() => passwordMutation.mutate()}>Update password</Button>
          </Section>
        </TabsContent>

        <TabsContent value="email" className="mt-4">
          <Section title="Email settings" description="Defaults applied to every campaign.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="e-name">Default sender name</Label>
                <Input id="e-name" defaultValue="Zahirul at LeadPilot" maxLength={100} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="e-delay">Delay between emails (seconds)</Label>
                <Input id="e-delay" type="number" min={1} max={600} defaultValue={35} />
              </div>
            </div>
            <Toggle
              label="Stop campaign on repeated failures"
              hint="Pause automatically after 25 consecutive errors."
              defaultChecked
            />
            <Button
              onClick={() =>
                saveMutation.mutate({
                  email_defaults: {
                    senderName: value("e-name"),
                    sendingInterval: Number(value("e-delay")),
                  },
                })
              }
            >
              Save email settings
            </Button>
          </Section>
        </TabsContent>

        <TabsContent value="import" className="mt-4">
          <Section title="Import settings" description="How uploaded spreadsheets are processed.">
            <Toggle
              label="Skip duplicate emails"
              hint="Ignore rows whose email already exists."
              defaultChecked
            />
            <Toggle
              label="Validate email format"
              hint="Mark invalid addresses instead of importing them."
              defaultChecked
            />
            <Toggle
              label="Trim whitespace"
              hint="Clean leading and trailing spaces in every column."
              defaultChecked
            />
            <Button
              onClick={() =>
                saveMutation.mutate({
                  import_settings: {
                    skipDuplicates: true,
                    validateEmail: true,
                    trimWhitespace: true,
                  },
                })
              }
            >
              Save import settings
            </Button>
          </Section>
        </TabsContent>

        <TabsContent value="preferences" className="mt-4">
          <Section
            title="Application preferences"
            description="Small details that shape your workspace."
          >
            <Toggle label="Compact tables" hint="Show more rows per screen." />
            <div className="space-y-2">
              <Label>Default landing page</Label>
              <Select defaultValue="dashboard">
                <SelectTrigger className="sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dashboard">Dashboard</SelectItem>
                  <SelectItem value="leads">Leads</SelectItem>
                  <SelectItem value="campaigns">Campaigns</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() =>
                saveMutation.mutate({ preferences: { defaultLandingPage: "dashboard" } })
              }
            >
              Save preferences
            </Button>
          </Section>
        </TabsContent>
      </Tabs>
    </>
  );
}
