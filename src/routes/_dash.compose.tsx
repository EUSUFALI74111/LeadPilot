import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, Code2, Send } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, jsonBody } from "@/lib/api";

type SendingAccount = {
  id: string;
  accountName: string;
  email: string;
  isActive: boolean;
  status: string;
  dailyLimit: number;
  perMinuteLimit: number;
};
type LeadOption = { id: string; fullName: string; email: string; companyName: string };
type Preview = {
  count: number;
  totalMatches: number;
  rangeStart: number;
  rangeEnd: number;
  samples: Array<{ id: string; name: string; email: string; subject: string; body: string }>;
  unknownVariables: string[];
  bodyFormat: "text" | "html";
};

export const Route = createFileRoute("/_dash/compose")({
  head: () => ({ meta: [{ title: "Email Composer — LeadPilot" }] }),
  component: ComposePage,
});

const variables = [
  "first_name",
  "last_name",
  "full_name",
  "email",
  "company_name",
  "phone",
  "job_title",
  "website",
  "linkedin",
  "facebook",
  "instagram",
  "twitter",
  "tiktok",
  "location",
  "country",
  "source",
];

function ComposePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accounts = useQuery({
    queryKey: ["smtp-accounts"],
    queryFn: () => api<SendingAccount[]>("smtp/accounts.php").then((r) => r.data),
    refetchOnMount: "always",
  });
  const leads = useQuery({
    queryKey: ["composer-leads"],
    queryFn: () => api<LeadOption[]>("leads.php?per_page=100").then((r) => r.data),
  });
  const [from, setFrom] = useState("");
  const [useAllAccounts, setUseAllAccounts] = useState(false);
  const [recipientMode, setRecipientMode] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ANY");
  const [filterCompany, setFilterCompany] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [filterJobTitle, setFilterJobTitle] = useState("");
  const [customFilterKey, setCustomFilterKey] = useState("");
  const [customFilterValue, setCustomFilterValue] = useState("");
  const [search, setSearch] = useState("");
  const [leadIds, setLeadIds] = useState<string[]>([]);
  const [rangeStart, setRangeStart] = useState("1");
  const [rangeEnd, setRangeEnd] = useState("500");
  const [subject, setSubject] = useState("Quick idea for {{company_name}}");
  const [body, setBody] = useState(
    "Hi {{first_name}},\n\nI came across {{company_name}} and noticed a quick opportunity.\n\nWould you be open to a short call this week?",
  );
  const [bodyFormat, setBodyFormat] = useState<"text" | "html">("text");
  const [sampleIndex, setSampleIndex] = useState(0);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState(() => defaultScheduleTime());
  const sendableAccounts = useMemo(
    () =>
      (accounts.data ?? []).filter(
        (account) => account.isActive && String(account.status).toUpperCase() === "CONNECTED",
      ),
    [accounts.data],
  );
  useEffect(() => {
    if (!sendableAccounts.length) {
      if (from) setFrom("");
      return;
    }
    if (!sendableAccounts.some((account) => account.id === from)) {
      setFrom(sendableAccounts[0]?.id ?? "");
    }
  }, [from, sendableAccounts]);
  const deferredSubject = useDeferredValue(subject);
  const deferredBody = useDeferredValue(body);
  const deferredSearch = useDeferredValue(search);
  const effectiveRecipientMode =
    recipientMode === "ALL" && filterStatus !== "ANY" ? "FILTER" : recipientMode;
  const selection = useMemo(
    () => ({
      recipientMode: effectiveRecipientMode,
      recipientStatus: filterStatus,
      search: deferredSearch,
      leadIds,
      filterCompany,
      filterSource,
      filterLocation,
      filterCountry,
      filterJobTitle,
      customFilterKey,
      customFilterValue,
      rangeStart: Number(rangeStart),
      rangeEnd: Number(rangeEnd),
    }),
    [
      effectiveRecipientMode,
      filterStatus,
      deferredSearch,
      leadIds,
      filterCompany,
      filterSource,
      filterLocation,
      filterCountry,
      filterJobTitle,
      customFilterKey,
      customFilterValue,
      rangeStart,
      rangeEnd,
    ],
  );
  const hasAdvancedFilter =
    filterStatus !== "ANY" ||
    [
      filterCompany,
      filterSource,
      filterLocation,
      filterCountry,
      filterJobTitle,
      customFilterKey && customFilterValue,
    ].some(Boolean);
  const preview = useQuery({
    queryKey: ["email-preview", selection, deferredSubject, deferredBody, bodyFormat],
    queryFn: () =>
      api<Preview>("email-preview.php", {
        method: "POST",
        body: jsonBody({ ...selection, subject: deferredSubject, body: deferredBody, bodyFormat }),
      }).then((r) => r.data),
    enabled:
      (effectiveRecipientMode !== "SELECTED" || leadIds.length > 0) &&
      (effectiveRecipientMode !== "FILTER" || hasAdvancedFilter),
    staleTime: 1000,
  });
  const data = preview.data;
  const sample = data?.samples[Math.min(sampleIndex, Math.max(0, (data?.samples.length ?? 1) - 1))];
  const queue = useMutation({
    mutationFn: (scheduledAt?: string) =>
      api<{
        id: string;
        name: string;
        recipients: number;
        campaignCount: number;
        alreadyReserved: number;
        scheduledAt: string;
      }>("quick-mail.php", {
        method: "POST",
        body: jsonBody({
          ...selection,
          subject,
          body,
          bodyFormat,
          smtpAccountIds: useAllAccounts ? sendableAccounts.map((account) => account.id) : [from],
          scheduledAt,
        }),
      }).then((r) => r.data),
    onSuccess: async (result, scheduledAt) => {
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success(
        scheduledAt
          ? `${result.name} scheduled for ${new Date(scheduledAt).toLocaleString()}`
          : `${result.campaignCount} campaign${result.campaignCount === 1 ? "" : "s"} queued for ${result.recipients.toLocaleString()} recipients${result.alreadyReserved ? `; ${result.alreadyReserved.toLocaleString()} already reserved elsewhere` : ""}`,
      );
      setScheduleOpen(false);
      navigate({ to: "/campaigns" });
    },
    onError: (error) => toast.error(error.message),
  });
  const validate = (): boolean => {
    const count = data?.count ?? 0;
    const start = Number(rangeStart);
    const end = Number(rangeEnd);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
      toast.error("Enter a valid recipient position range.");
      return false;
    }
    if (!from || (useAllAccounts && !sendableAccounts.length)) {
      toast.error("Select at least one active sending account.");
      return false;
    }
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and email body are required.");
      return false;
    }
    if (data?.unknownVariables.length) {
      toast.error("Fix unknown personalization variables first.");
      return false;
    }
    if (!count) {
      toast.error("No eligible recipients selected.");
      return false;
    }
    return true;
  };
  const submit = (): void => {
    if (!validate()) return;
    const count = data?.count ?? 0;
    if (window.confirm(`Queue this email for ${count.toLocaleString()} recipients?`))
      queue.mutate(undefined);
  };
  const selectedAccounts = useAllAccounts
    ? sendableAccounts
    : sendableAccounts.filter((account) => account.id === from);
  const combinedDailyLimit = selectedAccounts.reduce(
    (sum, account) => sum + Number(account.dailyLimit),
    0,
  );
  const estimatedDays = Math.max(
    1,
    Math.ceil((data?.count ?? 0) / Math.max(1, combinedDailyLimit)),
  );
  const addVariable = (name: string) =>
    setBody(
      (current) =>
        `${current}${current.endsWith(" ") || current.endsWith("\n") ? "" : " "}{{${name}}}`,
    );

  return (
    <>
      <PageHeader
        title="Email Composer"
        description="Compose, personalize, preview, and safely queue an email batch."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={queue.isPending || preview.isFetching}
              onClick={() => {
                if (validate()) setScheduleOpen(true);
              }}
            >
              <CalendarClock className="size-4" /> Schedule
            </Button>
            <Button disabled={queue.isPending || preview.isFetching} onClick={submit}>
              <Send className="size-4" /> {queue.isPending ? "Queueing…" : "Quick Mail"}
            </Button>
          </div>
        }
      />
      <div className="grid gap-4 lg:h-[calc(100dvh-10rem)] lg:min-h-[560px] lg:grid-cols-2 lg:overflow-hidden">
        <div className="surface-card space-y-4 p-5 lg:h-full lg:overflow-y-auto lg:overscroll-contain">
          <div className="space-y-2">
            <Label>From</Label>
            <Select
              value={from}
              onValueChange={setFrom}
              disabled={accounts.isLoading || useAllAccounts}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    accounts.isLoading
                      ? "Loading sending accounts…"
                      : "Select a tested SMTP account"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(accounts.data ?? []).map((account) => {
                  const available =
                    account.isActive && String(account.status).toUpperCase() === "CONNECTED";
                  return (
                    <SelectItem key={account.id} value={account.id} disabled={!available}>
                      {account.email} — {account.accountName}
                      {!available ? " (unavailable)" : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-muted/20 p-3">
              <Checkbox
                checked={useAllAccounts}
                onCheckedChange={(checked) => {
                  const enabled = checked === true;
                  setUseAllAccounts(enabled);
                  if (enabled) {
                    setRangeStart("1");
                    setRangeEnd(String(data?.totalMatches ?? 100000));
                  }
                }}
              />
              <span>
                <span className="block text-sm font-medium">Use all connected accounts</span>
                <span className="block text-xs text-muted-foreground">
                  Select every matching lead, divide the list equally, and run one independent
                  campaign per sender.
                </span>
              </span>
            </label>
            {useAllAccounts ? (
              <p className="text-xs font-medium text-primary">
                {sendableAccounts.length} connected account
                {sendableAccounts.length === 1 ? "" : "s"} selected
              </p>
            ) : null}
            {accounts.error ? (
              <p className="text-xs text-destructive">{accounts.error.message}</p>
            ) : sendableAccounts.length === 0 && !accounts.isLoading ? (
              <p className="text-xs text-destructive">
                No active, tested SMTP account is available. Test or enable one in Sending Accounts.
              </p>
            ) : from ? (
              <p className="text-xs text-muted-foreground">
                Sending from {sendableAccounts.find((account) => account.id === from)?.email}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Recipients</Label>
            <Select
              value={recipientMode}
              onValueChange={(value) => {
                setRecipientMode(value);
                setSampleIndex(0);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All eligible leads</SelectItem>
                <SelectItem value="FILTER">Advanced filters</SelectItem>
                <SelectItem value="SEARCH">Current search result</SelectItem>
                <SelectItem value="SELECTED">Selected leads</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {recipientMode === "ALL" || recipientMode === "FILTER" ? (
            <div className="space-y-2">
              <Label>Filter by lead status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANY">All eligible statuses</SelectItem>
                  <SelectItem value="QUALIFIED">Qualified only</SelectItem>
                  <SelectItem value="NEW">New only</SelectItem>
                  <SelectItem value="CONTACTED">Contacted only</SelectItem>
                  <SelectItem value="BOUNCED" disabled>
                    Bounced (suppressed)
                  </SelectItem>
                  <SelectItem value="UNSUBSCRIBED" disabled>
                    Unsubscribed (suppressed)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Bounced and unsubscribed leads can be viewed in Leads, but cannot receive campaigns.
              </p>
            </div>
          ) : null}
          {recipientMode === "SEARCH" ? (
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, email, company, or phone"
            />
          ) : null}
          {recipientMode === "FILTER" ? (
            <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
              <div>
                <p className="text-sm font-medium">Advanced recipient filters</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Filled filters are combined. Leave a field blank to ignore it.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FilterInput
                  label="Company"
                  value={filterCompany}
                  onChange={setFilterCompany}
                  placeholder="e.g. Veterans Affairs"
                />
                <FilterInput
                  label="Source / category"
                  value={filterSource}
                  onChange={setFilterSource}
                  placeholder="e.g. LinkedIn"
                />
                <FilterInput
                  label="Job title"
                  value={filterJobTitle}
                  onChange={setFilterJobTitle}
                  placeholder="e.g. Case Manager"
                />
                <FilterInput
                  label="Location"
                  value={filterLocation}
                  onChange={setFilterLocation}
                  placeholder="e.g. Virginia"
                />
                <FilterInput
                  label="Country"
                  value={filterCountry}
                  onChange={setFilterCountry}
                  placeholder="e.g. United States"
                />
                <FilterInput
                  label="Custom field key"
                  value={customFilterKey}
                  onChange={(value) =>
                    setCustomFilterKey(value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))
                  }
                  placeholder="company_category"
                />
                <FilterInput
                  label="Custom field value"
                  value={customFilterValue}
                  onChange={setCustomFilterValue}
                  placeholder="Government"
                />
              </div>
              {!hasAdvancedFilter ? (
                <p className="text-xs text-amber-700">
                  Choose at least one filter to calculate recipients.
                </p>
              ) : null}
            </div>
          ) : null}
          {recipientMode === "SELECTED" ? (
            <div className="max-h-48 space-y-1 overflow-auto rounded-lg border border-border p-2">
              {(leads.data ?? []).map((lead) => (
                <label
                  key={lead.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <Checkbox
                    checked={leadIds.includes(lead.id)}
                    onCheckedChange={(checked) =>
                      setLeadIds((current) =>
                        checked ? [...current, lead.id] : current.filter((id) => id !== lead.id),
                      )
                    }
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{lead.fullName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {lead.email} · {lead.companyName}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          ) : null}
          <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-4">
            <div>
              <p className="text-sm font-medium">Recipient positions</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Split the filtered list between senders: 1â€“500, then 501â€“1000, and so on.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="range-start">From position</Label>
                <Input
                  id="range-start"
                  type="number"
                  min={1}
                  value={rangeStart}
                  onChange={(event) => setRangeStart(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="range-end">To position</Label>
                <Input
                  id="range-end"
                  type="number"
                  min={1}
                  value={rangeEnd}
                  onChange={(event) => setRangeEnd(event.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Matching leads: {(data?.totalMatches ?? 0).toLocaleString()}. Active campaigns reserve
              each lead so another campaign cannot queue it twice.
            </p>
          </div>
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <p className="text-sm font-medium">
              Selected recipients: {(data?.count ?? 0).toLocaleString()}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Bounced and unsubscribed leads are always excluded.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              maxLength={200}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="body">Email body</Label>
            <Select
              value={bodyFormat}
              onValueChange={(value) => setBodyFormat(value as "text" | "html")}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Plain text</SelectItem>
                <SelectItem value="html">HTML + inline CSS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Textarea
            id="body"
            rows={15}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={250000}
            className={bodyFormat === "html" ? "font-mono text-xs" : ""}
          />
          {bodyFormat === "html" ? (
            <p className="flex gap-2 text-xs text-muted-foreground">
              <Code2 className="size-4 shrink-0" />
              Scripts, event handlers, forms, iframes, and executable code are removed server-side.
            </p>
          ) : null}
          <div>
            <p className="text-sm font-medium">Personalization variables</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {variables.map((variable) => (
                <button
                  key={variable}
                  type="button"
                  onClick={() => addVariable(variable)}
                  className="rounded-full border border-border px-2.5 py-1 font-mono text-[11px] hover:bg-accent"
                >{`{{${variable}}}`}</button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Imported custom fields also work, for example {"{{industry}}"}.
            </p>
          </div>
          {data?.unknownVariables.length ? (
            <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="size-4 shrink-0" />
              <span>
                Unknown variables: {data.unknownVariables.map((item) => `{{${item}}}`).join(", ")}
              </span>
            </div>
          ) : null}
        </div>
        <div className="surface-card p-5 lg:h-full lg:overflow-y-auto lg:overscroll-contain">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold">Live lead preview</p>
              <p className="text-sm text-muted-foreground">
                Rendered by the same server personalization engine used for delivery.
              </p>
            </div>
            {data?.samples.length ? (
              <Select
                value={String(Math.min(sampleIndex, data.samples.length - 1))}
                onValueChange={(value) => setSampleIndex(Number(value))}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {data.samples.map((item, index) => (
                    <SelectItem key={item.id} value={String(index)}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
          <div className="mt-4 min-h-[520px] overflow-hidden rounded-xl border border-border">
            <div className="space-y-1 border-b border-border p-4 text-sm">
              <p>
                <span className="text-muted-foreground">From:</span>{" "}
                {selectedAccounts[0]?.email ?? "Select an account"}
                {selectedAccounts.length > 1 ? ` + ${selectedAccounts.length - 1} more` : ""}
              </p>
              <p>
                <span className="text-muted-foreground">To:</span>{" "}
                {sample?.email ?? "No matching recipient"}
              </p>
              <p className="font-medium">{sample?.subject ?? subject}</p>
            </div>
            {bodyFormat === "html" ? (
              <iframe
                title="Email HTML preview"
                sandbox=""
                srcDoc={sample?.body ?? body}
                className="h-[560px] w-full bg-white"
              />
            ) : (
              <pre className="min-h-[440px] whitespace-pre-wrap p-4 font-sans text-sm leading-relaxed">
                {sample?.body ?? body}
              </pre>
            )}
          </div>
        </div>
      </div>
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule this campaign</DialogTitle>
            <DialogDescription>
              This exact recipient selection stays queued until the chosen time. Sending continues
              across later days when the account reaches its configured provider limit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="schedule-at">Start date and time</Label>
              <Input
                id="schedule-at"
                type="datetime-local"
                value={scheduleAt}
                min={defaultScheduleTime()}
                onChange={(event) => setScheduleAt(event.target.value)}
              />
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{(data?.count ?? 0).toLocaleString()} recipients</p>
              <p className="mt-1 text-muted-foreground">
                Estimated minimum: {estimatedDays} day{estimatedDays === 1 ? "" : "s"} at{" "}
                {combinedDailyLimit.toLocaleString()} combined accepted attempts/day across{" "}
                {selectedAccounts.length} account{selectedAccounts.length === 1 ? "" : "s"}.
                Provider throttling may extend this.
              </p>
            </div>
            <Button
              className="w-full"
              disabled={queue.isPending || !scheduleAt}
              onClick={() => {
                const date = new Date(scheduleAt);
                if (Number.isNaN(date.getTime()) || date.getTime() < Date.now() + 60_000) {
                  toast.error("Choose a time at least one minute in the future.");
                  return;
                }
                queue.mutate(date.toISOString());
              }}
            >
              <CalendarClock className="size-4" />{" "}
              {queue.isPending ? "Scheduling…" : "Schedule campaign"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function defaultScheduleTime() {
  const date = new Date(Date.now() + 5 * 60_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function FilterInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
