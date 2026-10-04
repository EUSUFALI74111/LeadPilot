import { Link, createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MailCheck,
  Send,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";

export const Route = createFileRoute("/_dash/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — LeadPilot" },
      {
        name: "description",
        content: "Overview of leads, email delivery and campaign performance.",
      },
      { property: "og:title", content: "Dashboard — LeadPilot" },
      {
        property: "og:description",
        content: "Overview of leads, email delivery and campaign performance.",
      },
    ],
  }),
  component: DashboardPage,
});

type DashboardData = {
  stats: Record<string, number | string>;
  failureBreakdown: Array<{ category: string; count: number }>;
  emailActivity: Array<{ day: string; sent: number; opened: number; failed: number }>;
  leadGrowth: Array<{ month: string; leads: number }>;
  recentCampaigns: Array<{
    id: string;
    name: string;
    status: string;
    recipients: number;
    sent: number;
    failed: number;
    pending: number;
  }>;
};

const chartTooltip = {
  contentStyle: {
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--card-foreground)",
    fontSize: 12,
  },
};

function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardData>("dashboard/stats.php").then((response) => response.data),
    refetchInterval: 30_000,
  });
  const stats = data?.stats ?? {};
  const cards = [
    {
      label: "Total Leads",
      value: Number(stats["totalLeads"] ?? 0),
      icon: Users,
      delta: "all time",
      tone: "text-primary bg-primary/10",
    },
    {
      label: "Valid Emails",
      value: Number(stats["validEmails"] ?? 0),
      icon: CheckCircle2,
      delta: "sendable",
      tone: "text-success bg-success/12",
    },
    {
      label: "Emails Sent",
      value: Number(stats["emailsSent"] ?? 0),
      icon: Send,
      delta: "all time",
      tone: "text-info bg-info/12",
    },
    {
      label: "Emails Pending",
      value: Number(stats["emailsPending"] ?? 0),
      icon: Clock,
      delta: "queued",
      tone: "text-warning-foreground bg-warning/20",
    },
    {
      label: "Emails Failed",
      value: Number(stats["emailsFailed"] ?? 0),
      icon: AlertTriangle,
      delta: "delivery errors",
      tone: "text-destructive bg-destructive/12",
    },
    {
      label: "Active Campaigns",
      value: Number(stats["activeCampaigns"] ?? 0),
      icon: MailCheck,
      delta: "live",
      tone: "text-primary bg-primary/10",
    },
  ];
  const emailActivity = data?.emailActivity ?? [];
  const leadGrowth = data?.leadGrowth ?? [];
  const campaigns = data?.recentCampaigns ?? [];
  const failureBreakdown = data?.failureBreakdown ?? [];
  const failureLabels: Record<string, { label: string; description: string }> = {
    HARD_BOUNCE: {
      label: "Bounced / invalid recipient",
      description: "The recipient address was permanently rejected.",
    },
    SENDER_AUTH: {
      label: "Sender account problem",
      description: "SMTP login or account authorization failed; the lead may still be valid.",
    },
    PROVIDER_REJECTED: {
      label: "Provider or policy rejection",
      description: "The receiving provider rejected the message or content.",
    },
    TEMPORARY: {
      label: "Temporary delivery problem",
      description: "A timeout, connection, or temporary server issue occurred.",
    },
    OTHER: {
      label: "Other / uncategorized",
      description: "A delivery error that did not match a known category.",
    },
  };
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="A live snapshot of your pipeline and outbound email performance."
      />
      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error.message}
        </div>
      ) : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading dashboard…</p> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ label, value, icon: Icon, delta, tone }) => (
          <div
            key={label}
            className="surface-card p-5 transition-shadow hover:shadow-[var(--shadow-elevated)]"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">
                  {value.toLocaleString()}
                </p>
              </div>
              <span className={`flex size-10 items-center justify-center rounded-xl ${tone}`}>
                <Icon className="size-5" />
              </span>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="size-3.5" /> {delta}
            </p>
          </div>
        ))}
      </div>

      {failureBreakdown.length ? (
        <div className="surface-card p-5">
          <div>
            <h2 className="font-semibold">Failed email categories</h2>
            <p className="text-sm text-muted-foreground">
              True invalid addresses become Bounced leads; other final failures become Send failed
              leads.
            </p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {failureBreakdown.map((item) => {
              const copy = failureLabels[item.category] ?? failureLabels.OTHER;
              return (
                <a
                  key={item.category}
                  href={`/leads?status=${encodeURIComponent(item.category === "HARD_BOUNCE" ? "Bounced" : "Send failed")}`}
                  className="rounded-xl border border-border p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{copy.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{copy.description}</p>
                    </div>
                    <span className="text-xl font-semibold text-destructive">
                      {Number(item.count).toLocaleString()}
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="surface-card p-5 lg:col-span-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Email sending activity</h2>
              <p className="text-sm text-muted-foreground">Last 7 days</p>
            </div>
          </div>
          <div className="mt-5 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={emailActivity} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  stroke="var(--muted-foreground)"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  stroke="var(--muted-foreground)"
                />
                <Tooltip cursor={{ fill: "var(--muted)" }} {...chartTooltip} />
                <Bar dataKey="sent" name="Sent" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="opened" name="Opened" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="failed" name="Failed" fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-card p-5 lg:col-span-2">
          <h2 className="font-semibold">Lead growth</h2>
          <p className="text-sm text-muted-foreground">Cumulative leads by month</p>
          <div className="mt-5 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={leadGrowth}>
                <defs>
                  <linearGradient id="leadFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  stroke="var(--muted-foreground)"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  stroke="var(--muted-foreground)"
                />
                <Tooltip {...chartTooltip} />
                <Area
                  type="monotone"
                  dataKey="leads"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="url(#leadFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="surface-card p-5">
        <h2 className="font-semibold">Campaign performance</h2>
        <p className="text-sm text-muted-foreground">Progress across your recent campaigns</p>
        <div className="mt-5 space-y-4">
          {campaigns.slice(0, 4).map((c) => {
            const pct = c.recipients ? Math.round((c.sent / c.recipients) * 100) : 0;
            return (
              <Link
                key={c.id}
                to="/campaigns/$campaignId"
                params={{ campaignId: c.id }}
                className="block rounded-xl border border-border p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {c.sent.toLocaleString()} of {c.recipients.toLocaleString()} sent ·{" "}
                      {c.failed.toLocaleString()} failed
                    </p>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                <Progress value={pct} className="mt-3 h-2" />
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
