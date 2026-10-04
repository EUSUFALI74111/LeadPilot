import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
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
import { api } from "@/lib/api";

type CampaignLog = {
  id: number;
  time: string;
  campaign: string;
  recipient: string;
  account: string;
  status: string;
  detail: string;
};

export const Route = createFileRoute("/_dash/logs")({
  head: () => ({
    meta: [
      { title: "Campaign Logs — LeadPilot" },
      { name: "description", content: "Delivery log for every email your campaigns attempted." },
      { property: "og:title", content: "Campaign Logs — LeadPilot" },
      {
        property: "og:description",
        content: "Delivery log for every email your campaigns attempted.",
      },
    ],
  }),
  component: LogsPage,
});

function LogsPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const {
    data: allRows = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["email-logs", status],
    queryFn: () =>
      api<CampaignLog[]>(
        `email-logs.php?per_page=100${status !== "all" ? `&status=${encodeURIComponent(status)}` : ""}`,
      ).then((r) => r.data),
    refetchInterval: 15_000,
  });
  const q = query.trim().toLowerCase();
  const rows = allRows.filter(
    (l) => !q || l.recipient.toLowerCase().includes(q) || l.campaign.toLowerCase().includes(q),
  );

  return (
    <>
      <PageHeader
        title="Campaign Logs"
        description="Per-message delivery history across all campaigns."
      />
      {error ? <p className="text-sm text-destructive">{error.message}</p> : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading logs…</p> : null}

      <div className="surface-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search recipient or campaign"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="md:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="SENT">Sent</SelectItem>
              <SelectItem value="RETRY">Retry</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {l.time}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{l.campaign}</TableCell>
                  <TableCell className="whitespace-nowrap">{l.recipient}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {l.account}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={l.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{l.detail}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    No log entries match your filters.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
