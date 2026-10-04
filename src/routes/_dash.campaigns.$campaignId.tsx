import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, jsonBody } from "@/lib/api";

type CampaignDetailData = {
  campaign: {
    id: string;
    name: string;
    subject: string;
    status: string;
    recipients: number;
    sent: number;
    failed: number;
    pending: number;
    sender: string;
    senderAccountId: string;
    startedAt: string | null;
    completedAt: string | null;
  };
  recipients: Array<{
    id: number;
    email: string;
    name: string;
    status: string;
    attempts: number;
    sentAt: string | null;
    failureReason: string | null;
    failureCategory: string | null;
  }>;
};

type SendingAccountOption = {
  id: string;
  email: string;
  accountName: string;
  status: string;
  isActive: boolean;
  dailyLimit: number;
  sentToday: number;
};

export const Route = createFileRoute("/_dash/campaigns/$campaignId")({
  head: () => ({
    meta: [
      { title: "Campaign details — LeadPilot" },
      {
        name: "description",
        content: "Delivery progress and recipient activity for this campaign.",
      },
      { property: "og:title", content: "Campaign details — LeadPilot" },
      {
        property: "og:description",
        content: "Delivery progress and recipient activity for this campaign.",
      },
    ],
  }),
  component: CampaignDetail,
});

function CampaignDetail() {
  const { campaignId } = Route.useParams();
  const queryClient = useQueryClient();
  const [activityStatus, setActivityStatus] = useState<"ALL" | "FAILED">("ALL");
  const [activityPage, setActivityPage] = useState(1);
  const [switchAccountOpen, setSwitchAccountOpen] = useState(false);
  const [nextAccountId, setNextAccountId] = useState("");
  const query = useQuery({
    queryKey: ["campaign", campaignId, activityStatus, activityPage],
    queryFn: () =>
      api<CampaignDetailData>(
        `campaigns/view.php?id=${encodeURIComponent(campaignId)}&page=${activityPage}&per_page=50${activityStatus === "FAILED" ? "&status=FAILED" : ""}`,
      ),
    refetchInterval: 15_000,
  });
  const action = useMutation({
    mutationFn: (name: string) =>
      api(`campaigns/${name}.php`, { method: "POST", body: jsonBody({ id: campaignId }) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
      toast.success("Campaign updated");
    },
    onError: (reason) => toast.error(reason.message),
  });
  const accounts = useQuery({
    queryKey: ["smtp-accounts"],
    queryFn: () =>
      api<SendingAccountOption[]>("smtp/accounts.php").then((response) => response.data),
    staleTime: 30_000,
  });
  const switchAccount = useMutation({
    mutationFn: () =>
      api("campaigns/switch-account.php", {
        method: "POST",
        body: jsonBody({ id: campaignId, smtpAccountId: nextAccountId }),
      }),
    onSuccess: async () => {
      setSwitchAccountOpen(false);
      setNextAccountId("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] }),
        queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      toast.success("Sending account changed. The remaining campaign is continuing.");
    },
    onError: (reason) => toast.error(reason.message),
  });
  const purgeFailed = useMutation({
    mutationFn: () =>
      api<{ deleted: number }>("campaigns/purge-failed-leads.php", {
        method: "DELETE",
        body: jsonBody({ id: campaignId }),
      }).then((response) => response.data),
    onSuccess: async (result) => {
      setActivityPage(1);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] }),
        queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
        queryClient.invalidateQueries({ queryKey: ["campaign-groups"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["leads"] }),
      ]);
      toast.success(
        `${result.deleted.toLocaleString()} failed lead${result.deleted === 1 ? "" : "s"} permanently deleted`,
      );
    },
    onError: (reason) => toast.error(reason.message),
  });
  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading campaign…</p>;
  if (query.error || !query.data?.data)
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {query.error?.message ?? "Campaign not found."}
      </div>
    );
  const { campaign, recipients } = query.data.data;
  const activityPages = Math.max(1, Number(query.data.meta.pages ?? 1));
  const activityTotal = Number(query.data.meta.total ?? recipients.length);
  const failureLabels: Record<string, string> = {
    HARD_BOUNCE: "Bounced / invalid recipient",
    SENDER_AUTH: "Sender account problem",
    PROVIDER_REJECTED: "Provider or policy rejection",
    TEMPORARY: "Temporary delivery problem",
    OTHER: "Other delivery problem",
  };
  const pending = Number(campaign.pending);
  const pct = Number(campaign.recipients)
    ? Math.round((Number(campaign.sent) / Number(campaign.recipients)) * 100)
    : 0;

  const stats = [
    ["Total recipients", Number(campaign.recipients).toLocaleString()],
    ["Sent", Number(campaign.sent).toLocaleString()],
    ["Pending", pending.toLocaleString()],
    ["Failed", campaign.failed.toLocaleString()],
    ["Start time", campaign.startedAt],
    ["Completion time", campaign.completedAt ?? "—"],
  ] as const;

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
        <Link to="/campaigns">
          <ArrowLeft className="size-4" /> All campaigns
        </Link>
      </Button>

      <PageHeader
        title={campaign.name}
        description={campaign.subject}
        actions={
          <>
            <StatusBadge status={campaign.status} />
            {campaign.status === "DRAFT" ? (
              <Button size="sm" onClick={() => action.mutate("start")}>
                <Play className="size-4" /> Start
              </Button>
            ) : null}
            {["QUEUED", "RUNNING"].includes(campaign.status) ? (
              <Button variant="outline" size="sm" onClick={() => action.mutate("pause")}>
                <Pause className="size-4" /> Pause
              </Button>
            ) : null}
            {campaign.status === "PAUSED" ? (
              <Button size="sm" onClick={() => action.mutate("resume")}>
                <Play className="size-4" /> Resume
              </Button>
            ) : null}
            {Number(campaign.failed) > 0 ? (
              <Button variant="outline" size="sm" onClick={() => action.mutate("retry-failed")}>
                <RotateCcw className="size-4" /> Retry failed
              </Button>
            ) : null}
            {["QUEUED", "RUNNING", "PAUSED"].includes(campaign.status) && pending > 0 ? (
              <Button variant="outline" size="sm" onClick={() => setSwitchAccountOpen(true)}>
                <RotateCcw className="size-4" /> Change sender
              </Button>
            ) : null}
            {!["COMPLETED", "FAILED", "CANCELLED"].includes(campaign.status) ? (
              <Button variant="destructive" size="sm" onClick={() => action.mutate("cancel")}>
                <XCircle className="size-4" /> Cancel
              </Button>
            ) : null}
          </>
        }
      />

      <Dialog open={switchAccountOpen} onOpenChange={setSwitchAccountOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change sending account and continue</DialogTitle>
            <DialogDescription>
              Already sent recipients stay unchanged. Only the {pending.toLocaleString()} pending
              recipients will use the new account. A paused campaign resumes automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              Current sender: <span className="font-medium">{campaign.sender}</span>
            </div>
            <Select value={nextAccountId} onValueChange={setNextAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Select another connected account" />
              </SelectTrigger>
              <SelectContent>
                {(accounts.data ?? [])
                  .filter(
                    (account) =>
                      account.id !== campaign.senderAccountId &&
                      account.status === "CONNECTED" &&
                      account.isActive &&
                      Number(account.sentToday) < Number(account.dailyLimit),
                  )
                  .map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.email} ·{" "}
                      {(Number(account.dailyLimit) - Number(account.sentToday)).toLocaleString()}{" "}
                      remaining today
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Only enabled, connected accounts with daily capacity are shown.
            </p>
            <Button
              className="w-full"
              disabled={!nextAccountId || switchAccount.isPending}
              onClick={() => switchAccount.mutate()}
            >
              {switchAccount.isPending ? "Changing account…" : "Change account & continue"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="surface-card p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Progress</span>
          <span className="text-muted-foreground">{pct}%</span>
        </div>
        <Progress value={pct} className="mt-3 h-2.5" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map(([label, value]) => (
          <div key={label} className="surface-card p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1.5 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <p className="font-semibold">Recipient activity</p>
            <p className="text-xs text-muted-foreground">
              {activityTotal.toLocaleString()} {activityStatus === "FAILED" ? "failed" : "total"}{" "}
              recipient records
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={activityStatus === "ALL" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setActivityStatus("ALL");
                setActivityPage(1);
              }}
            >
              All
            </Button>
            <Button
              variant={activityStatus === "FAILED" ? "destructive" : "outline"}
              size="sm"
              onClick={() => {
                setActivityStatus("FAILED");
                setActivityPage(1);
              }}
            >
              Failed ({Number(campaign.failed).toLocaleString()})
            </Button>
            {activityStatus === "FAILED" && Number(campaign.failed) > 0 ? (
              <Button
                variant="destructive"
                size="sm"
                disabled={purgeFailed.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      "Permanently delete every lead currently shown as failed in this campaign? This also removes those leads and their recipient history from other campaigns. Some failures can be caused by sender authentication or provider policy rather than an invalid address. This cannot be undone.",
                    )
                  )
                    purgeFailed.mutate();
                }}
              >
                {purgeFailed.isPending ? "Deleting…" : "Delete failed leads"}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Sending account</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recipients.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {log.sentAt ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{log.email}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    Attempt {log.attempts}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={log.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {log.failureCategory ? (
                      <p className="mb-1 font-medium text-foreground">
                        {failureLabels[log.failureCategory] ?? "Other delivery problem"}
                      </p>
                    ) : null}
                    {log.failureReason ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
              {!recipients.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    No {activityStatus === "FAILED" ? "failed " : ""}recipient records found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <p className="text-sm text-muted-foreground">
            Page {activityPage} of {activityPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={activityPage <= 1}
              onClick={() => setActivityPage((page) => page - 1)}
            >
              <ChevronLeft className="size-4" /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={activityPage >= activityPages}
              onClick={() => setActivityPage((page) => page + 1)}
            >
              Next <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
