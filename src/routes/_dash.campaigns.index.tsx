import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Layers3, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { api, jsonBody } from "@/lib/api";

type Campaign = {
  id: string;
  name: string;
  subject: string;
  status: string;
  recipients: number;
  sent: number;
  failed: number;
  pending: number;
  sender: string;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  canDelete: boolean;
  nextDeliveryAt: string | null;
};

type CampaignGroup = {
  id: string;
  name: string;
  subject: string;
  status: string;
  accountCount: number;
  recipients: number;
  sent: number;
  failed: number;
  pending: number;
  suppressed: number;
};

export const Route = createFileRoute("/_dash/campaigns/")({
  head: () => ({
    meta: [
      { title: "Email Sending History — LeadPilot" },
      { name: "description", content: "Review every queued email batch and its delivery status." },
    ],
  }),
  component: CampaignsPage,
});

const PAGE_SIZE = 12;

function CampaignsPage() {
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<Campaign | null>(null);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["campaigns", page],
    queryFn: () => api<Campaign[]>(`campaigns.php?page=${page}&per_page=${PAGE_SIZE}`),
  });
  const campaigns = query.data?.data ?? [];
  const groupsQuery = useQuery({
    queryKey: ["campaign-groups"],
    queryFn: () => api<CampaignGroup[]>("campaign-groups.php").then((response) => response.data),
    refetchInterval: 30_000,
  });
  const pages = Math.max(1, Number(query.data?.meta["pages"] ?? 1));
  const remove = useMutation({
    mutationFn: (id: string) =>
      api<{ deleted: number }>("campaigns/delete.php", {
        method: "DELETE",
        body: jsonBody({ id }),
      }),
    onSuccess: async () => {
      setDeleting(null);
      if (campaigns.length === 1 && page > 1) setPage((current) => current - 1);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
        queryClient.invalidateQueries({ queryKey: ["campaign-groups"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      toast.success("Campaign history permanently deleted");
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <>
      <PageHeader
        title="Email Sending History"
        description="Every Quick Mail batch, from queueing through final delivery."
      />
      {query.error ? <p className="text-sm text-destructive">{query.error.message}</p> : null}
      {(groupsQuery.data ?? []).length ? (
        <section className="space-y-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Layers3 className="size-5 text-primary" /> Multi-sender results
            </h2>
            <p className="text-sm text-muted-foreground">
              Combined progress for batches automatically divided across all selected accounts.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {(groupsQuery.data ?? []).map((group) => {
              const recipients = Number(group.recipients);
              const sent = Number(group.sent);
              const failed = Number(group.failed);
              const pending = Number(group.pending);
              const progress = recipients ? Math.round(((sent + failed) / recipients) * 100) : 0;
              return (
                <div key={group.id} className="surface-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {group.name.replace(/\s+\d+\/\d+$/, "")}
                      </p>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{group.subject}</p>
                    </div>
                    <StatusBadge status={group.status} />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {Number(group.accountCount)} independent sender campaigns
                  </p>
                  <div className="mt-4 grid grid-cols-3 gap-3 text-sm sm:grid-cols-6">
                    {[
                      ["Total", recipients],
                      ["Sent", sent],
                      ["Qualified", sent],
                      ["Pending", pending],
                      ["Failed", failed],
                      ["Suppressed", Number(group.suppressed)],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <p className="text-[11px] text-muted-foreground">{label}</p>
                        <p className="font-medium">{Number(value).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                  <Progress value={progress} className="mt-4 h-2" />
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading history…</p> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {campaigns.map((campaign) => {
          const recipients = Number(campaign.recipients);
          const sent = Number(campaign.sent);
          const failed = Number(campaign.failed);
          const pending = Number(campaign.pending);
          const progress = recipients ? Math.round(((sent + failed) / recipients) * 100) : 0;
          return (
            <div
              key={campaign.id}
              className="surface-card overflow-hidden transition-shadow hover:shadow-[var(--shadow-elevated)]"
            >
              <Link
                to="/campaigns/$campaignId"
                params={{ campaignId: campaign.id }}
                className="block p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{campaign.name}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {campaign.subject}
                    </p>
                  </div>
                  <StatusBadge status={campaign.status} />
                </div>
                <p className="mt-3 truncate text-xs text-muted-foreground">
                  From: {campaign.sender}
                </p>
                <div className="mt-4 grid grid-cols-4 gap-2 text-sm">
                  {[
                    ["Recipients", recipients],
                    ["Sent", sent],
                    ["Pending", pending],
                    ["Failed", failed],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-[11px] text-muted-foreground">{label}</p>
                      <p className="font-medium">{Number(value).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
                <Progress value={progress} className="mt-4 h-2" />
                <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
                  <p>Started: {campaign.startedAt ?? campaign.createdAt ?? "Waiting"}</p>
                  <p>Completed: {campaign.completedAt ?? "—"}</p>
                  {pending > 0 && campaign.nextDeliveryAt ? (
                    <p className="font-medium text-primary">
                      Next attempt: {campaign.nextDeliveryAt}
                    </p>
                  ) : null}
                </div>
              </Link>
              {campaign.canDelete ? (
                <div className="border-t border-border px-5 py-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeleting(campaign)}
                  >
                    <Trash2 className="size-4" /> Delete history
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
        {!query.isLoading && campaigns.length === 0 ? (
          <div className="surface-card col-span-full p-10 text-center text-muted-foreground">
            No sending history yet. Queue your first batch from Email Composer.
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Page {page} of {pages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            <ChevronLeft className="size-4" /> Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => setPage((value) => value + 1)}
          >
            Next <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this campaign history?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes “{deleting?.name}”, its recipient activity, delivery logs,
              replies, and failure records from the database. Bounced leads remain quarantined in
              Leads until you delete them separately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Keep history</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending || !deleting}
              onClick={(event) => {
                event.preventDefault();
                if (deleting) remove.mutate(deleting.id);
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
