import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Facebook,
  Globe,
  Instagram,
  Linkedin,
  Link as LinkIcon,
  Music2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Twitter,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api, jsonBody } from "@/lib/api";

type Lead = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  companyName: string;
  phone: string;
  jobTitle: string;
  website: string;
  linkedin: string;
  facebook: string;
  instagram: string;
  twitter: string;
  tiktok: string;
  otherSocialLinks: Record<string, string> | string[];
  location: string;
  country: string;
  source: string;
  status: "New" | "Contacted" | "Qualified" | "Send failed" | "Bounced" | "Unsubscribed";
  bounceReason: string;
  bouncedAt: string | null;
  notes: string;
  customFields: Record<string, string>;
  addedDate: string;
};
type LeadDraft = Omit<Lead, "id" | "addedDate" | "bounceReason" | "bouncedAt">;
const emptyLead: LeadDraft = {
  firstName: "",
  lastName: "",
  fullName: "",
  email: "",
  companyName: "",
  phone: "",
  jobTitle: "",
  website: "",
  linkedin: "",
  facebook: "",
  instagram: "",
  twitter: "",
  tiktok: "",
  otherSocialLinks: {},
  location: "",
  country: "",
  source: "",
  status: "New",
  notes: "",
  customFields: {},
};
const PAGE_SIZE = 15;

export const Route = createFileRoute("/_dash/leads")({
  head: () => ({ meta: [{ title: "Leads — LeadPilot" }] }),
  component: LeadsPage,
});

function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
function SocialLink({
  value,
  label,
  children,
}: {
  value: string;
  label: string;
  children: React.ReactNode;
}) {
  const href = safeUrl(value);
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-primary"
    >
      {children}
    </a>
  ) : null;
}

function LeadForm({
  value,
  onChange,
  onSave,
  saving,
}: {
  value: LeadDraft | Lead;
  onChange: (lead: LeadDraft | Lead) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const set = (key: keyof LeadDraft, next: unknown) => onChange({ ...value, [key]: next });
  const fields: Array<[keyof LeadDraft, string, string?]> = [
    ["firstName", "First Name"],
    ["lastName", "Last Name"],
    ["email", "Email", "email"],
    ["companyName", "Company Name"],
    ["phone", "Phone"],
    ["jobTitle", "Job Title"],
    ["website", "Website", "url"],
    ["linkedin", "LinkedIn", "url"],
    ["facebook", "Facebook", "url"],
    ["instagram", "Instagram", "url"],
    ["twitter", "Twitter / X", "url"],
    ["tiktok", "TikTok", "url"],
    ["location", "Location"],
    ["country", "Country"],
    ["source", "Source"],
  ];
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(([key, label, type]) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`lead-${key}`}>{label}</Label>
            <Input
              id={`lead-${key}`}
              type={type ?? "text"}
              value={String(value[key] ?? "")}
              onChange={(event) => set(key, event.target.value)}
              required={key === "firstName" || key === "email"}
            />
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label>Status</Label>
        <Select value={value.status} onValueChange={(next) => set("status", next)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["New", "Contacted", "Qualified", "Send failed", "Bounced", "Unsubscribed"].map(
              (item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea
          rows={3}
          value={value.notes}
          onChange={(event) => set("notes", event.target.value)}
        />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <Label>Custom Fields</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              set("customFields", {
                ...value.customFields,
                [`field_${Object.keys(value.customFields).length + 1}`]: "",
              })
            }
          >
            <Plus className="size-3" /> Add field
          </Button>
        </div>
        <div className="mt-2 space-y-2">
          {Object.entries(value.customFields ?? {}).map(([key, item]) => (
            <div key={key} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Input
                value={key}
                onChange={(event) => {
                  const next = { ...value.customFields };
                  delete next[key];
                  next[event.target.value] = item;
                  set("customFields", next);
                }}
                placeholder="Field name"
              />
              <Input
                value={String(item)}
                onChange={(event) =>
                  set("customFields", { ...value.customFields, [key]: event.target.value })
                }
                placeholder="Value"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  const next = { ...value.customFields };
                  delete next[key];
                  set("customFields", next);
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
      <Button className="w-full" disabled={saving}>
        {saving ? "Saving…" : "Save lead"}
      </Button>
    </form>
  );
}

function LeadsPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get("status") ?? "all";
    return ["New", "Contacted", "Qualified", "Send failed", "Bounced", "Unsubscribed"].includes(
      requested,
    )
      ? requested
      : "all";
  });
  const [source, setSource] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [location, setLocation] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [viewing, setViewing] = useState<Lead | null>(null);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [adding, setAdding] = useState<LeadDraft | null>(null);
  const qc = useQueryClient();
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(PAGE_SIZE),
    search: query,
    status: status === "all" ? "" : status,
    source,
    company,
    job_title: jobTitle,
    location,
  });
  const leads = useQuery({
    queryKey: ["leads", params.toString()],
    queryFn: () => api<Lead[]>(`leads.php?${params}`),
  });
  const rows = leads.data?.data ?? [];
  const total = Number(leads.data?.meta["total"] ?? 0);
  const pages = Math.max(1, Number(leads.data?.meta["pages"] ?? 1));
  const save = useMutation({
    mutationFn: ({ lead, create }: { lead: LeadDraft | Lead; create: boolean }) =>
      api(create ? "leads.php" : "leads/update.php", {
        method: create ? "POST" : "PUT",
        body: jsonBody(lead),
      }),
    onSuccess: async () => {
      setAdding(null);
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead saved");
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (ids: string[]) =>
      api("leads/delete.php", { method: "DELETE", body: jsonBody({ ids }) }),
    onSuccess: async () => {
      setSelected([]);
      await qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead deleted");
    },
    onError: (error) => toast.error(error.message),
  });
  const purgeSuppressed = useMutation({
    mutationFn: (body: {
      scope: "ALL" | "SELECTED";
      status: "BOUNCED" | "SEND_FAILED";
      ids?: string[];
    }) =>
      api<{ deleted: number }>("leads/purge-status.php", {
        method: "DELETE",
        body: jsonBody(body),
      }).then((response) => response.data),
    onSuccess: async (result) => {
      setSelected([]);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["leads"] }),
        qc.invalidateQueries({ queryKey: ["campaigns"] }),
        qc.invalidateQueries({ queryKey: ["replies"] }),
      ]);
      toast.success(
        `${result.deleted.toLocaleString()} lead${result.deleted === 1 ? "" : "s"} permanently deleted`,
      );
    },
    onError: (error) => toast.error(error.message),
  });
  const resetPage = () => setPage(1);
  const all = rows.length > 0 && rows.every((row) => selected.includes(row.id));
  return (
    <>
      <PageHeader
        title="Leads"
        description={`${total.toLocaleString()} leads match your filters.`}
        actions={
          <>
            <Button variant="outline" asChild>
              <a href="/api/leads/export.php">
                <Download className="size-4" /> Export Data
              </a>
            </Button>
            <Button onClick={() => setAdding({ ...emptyLead })}>
              <Plus className="size-4" /> Add lead
            </Button>
          </>
        }
      />
      <div className="surface-card overflow-hidden">
        <div className="grid gap-3 border-b border-border p-4 md:grid-cols-3 xl:grid-cols-6">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Name, email, company, phone"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                resetPage();
              }}
            />
          </div>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              resetPage();
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {["New", "Contacted", "Qualified", "Send failed", "Bounced", "Unsubscribed"].map(
                (item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          <Input
            placeholder="Source"
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              resetPage();
            }}
          />
          <Input
            placeholder="Company"
            value={company}
            onChange={(event) => {
              setCompany(event.target.value);
              resetPage();
            }}
          />
          <Input
            placeholder="Job title / location"
            value={jobTitle || location}
            onChange={(event) => {
              setJobTitle(event.target.value);
              setLocation(event.target.value);
              resetPage();
            }}
          />
        </div>
        {status === "Bounced" || status === "Send failed" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-destructive/5 px-4 py-3 text-sm">
            <div>
              <p className="font-medium">{status} quarantine</p>
              <p className="text-xs text-muted-foreground">
                These leads are excluded from future campaigns until you edit their status or delete
                them.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              disabled={!total || purgeSuppressed.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Permanently delete all ${total.toLocaleString()} ${status.toLowerCase()} leads and their recipient history? This cannot be undone.`,
                  )
                )
                  purgeSuppressed.mutate({
                    scope: "ALL",
                    status: status === "Bounced" ? "BOUNCED" : "SEND_FAILED",
                  });
              }}
            >
              <Trash2 className="size-4" /> Delete all {status.toLowerCase()}
            </Button>
          </div>
        ) : null}
        {selected.length ? (
          <div className="flex items-center justify-between border-b border-border bg-accent/50 px-4 py-2 text-sm">
            <span>{selected.length} selected</span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (
                  !window.confirm(
                    `Permanently delete ${selected.length} selected lead${selected.length === 1 ? "" : "s"}?`,
                  )
                )
                  return;
                if (status === "Bounced" || status === "Send failed")
                  purgeSuppressed.mutate({
                    scope: "SELECTED",
                    status: status === "Bounced" ? "BOUNCED" : "SEND_FAILED",
                    ids: selected,
                  });
                else remove.mutate(selected);
              }}
            >
              <Trash2 className="size-4" /> Delete selected
            </Button>
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={all}
                    onCheckedChange={(checked) =>
                      setSelected(checked ? rows.map((row) => row.id) : [])
                    }
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Job / Location</TableHead>
                <TableHead>Links</TableHead>
                <TableHead>Status</TableHead>
                {status === "Bounced" || status === "Send failed" ? (
                  <TableHead>Failure reason</TableHead>
                ) : null}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.includes(lead.id)}
                      onCheckedChange={(checked) =>
                        setSelected((current) =>
                          checked
                            ? [...new Set([...current, lead.id])]
                            : current.filter((id) => id !== lead.id),
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{lead.fullName}</p>
                    <p className="text-xs text-muted-foreground">{lead.phone}</p>
                  </TableCell>
                  <TableCell>{lead.email}</TableCell>
                  <TableCell>{lead.companyName}</TableCell>
                  <TableCell>
                    <p>{lead.jobTitle}</p>
                    <p className="text-xs text-muted-foreground">{lead.location}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex">
                      <SocialLink value={lead.website} label="Website">
                        <Globe className="size-4" />
                      </SocialLink>
                      <SocialLink value={lead.linkedin} label="LinkedIn">
                        <Linkedin className="size-4" />
                      </SocialLink>
                      <SocialLink value={lead.facebook} label="Facebook">
                        <Facebook className="size-4" />
                      </SocialLink>
                      <SocialLink value={lead.instagram} label="Instagram">
                        <Instagram className="size-4" />
                      </SocialLink>
                      <SocialLink value={lead.twitter} label="Twitter">
                        <Twitter className="size-4" />
                      </SocialLink>
                      <SocialLink value={lead.tiktok} label="TikTok">
                        <Music2 className="size-4" />
                      </SocialLink>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={lead.status} />
                  </TableCell>
                  {status === "Bounced" || status === "Send failed" ? (
                    <TableCell className="max-w-80">
                      <p className="line-clamp-2 text-sm text-destructive">
                        {lead.bounceReason || "The message could not be delivered."}
                      </p>
                      {lead.bouncedAt ? (
                        <p className="mt-1 text-xs text-muted-foreground">{lead.bouncedAt}</p>
                      ) : null}
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <div className="flex justify-end">
                      <Button variant="ghost" size="icon" onClick={() => setViewing(lead)}>
                        <Eye className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setEditing({ ...lead })}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => {
                          if (!window.confirm(`Permanently delete ${lead.email}?`)) return;
                          if (lead.status === "Bounced" || lead.status === "Send failed")
                            purgeSuppressed.mutate({
                              scope: "SELECTED",
                              status: lead.status === "Bounced" ? "BOUNCED" : "SEND_FAILED",
                              ids: [lead.id],
                            });
                          else remove.mutate([lead.id]);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!leads.isLoading && !rows.length ? (
                <TableRow>
                  <TableCell
                    colSpan={status === "Bounced" || status === "Send failed" ? 9 : 8}
                    className="py-12 text-center text-muted-foreground"
                  >
                    No leads match your filters.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between border-t border-border p-4">
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
      </div>
      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewing?.fullName}</DialogTitle>
            <DialogDescription>{viewing?.companyName || "Complete lead record"}</DialogDescription>
          </DialogHeader>
          {viewing ? (
            <>
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                {[
                  ["First Name", viewing.firstName],
                  ["Last Name", viewing.lastName],
                  ["Email", viewing.email],
                  ["Phone", viewing.phone],
                  ["Company", viewing.companyName],
                  ["Job Title", viewing.jobTitle],
                  ["Location", viewing.location],
                  ["Country", viewing.country],
                  ["Source", viewing.source],
                  ["Status", viewing.status],
                  [
                    viewing.status === "Send failed" ? "Failure reason" : "Bounce reason",
                    viewing.bounceReason,
                  ],
                  [
                    viewing.status === "Send failed" ? "Failed at" : "Bounced at",
                    viewing.bouncedAt,
                  ],
                  ["Notes", viewing.notes],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border p-3">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 break-words">{value || "—"}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap gap-1">
                <SocialLink value={viewing.website} label="Website">
                  <Globe className="size-4" />
                </SocialLink>
                <SocialLink value={viewing.linkedin} label="LinkedIn">
                  <Linkedin className="size-4" />
                </SocialLink>
                <SocialLink value={viewing.facebook} label="Facebook">
                  <Facebook className="size-4" />
                </SocialLink>
                <SocialLink value={viewing.instagram} label="Instagram">
                  <Instagram className="size-4" />
                </SocialLink>
                <SocialLink value={viewing.twitter} label="Twitter">
                  <Twitter className="size-4" />
                </SocialLink>
                <SocialLink value={viewing.tiktok} label="TikTok">
                  <Music2 className="size-4" />
                </SocialLink>
                <LinkIcon className="ml-2 size-4 text-muted-foreground" />
              </div>
              {Object.keys(viewing.customFields ?? {}).length ? (
                <div>
                  <p className="mb-2 font-medium">Custom fields</p>
                  <dl className="grid gap-2 sm:grid-cols-2">
                    {Object.entries(viewing.customFields).map(([key, value]) => (
                      <div key={key} className="rounded border p-2 text-sm">
                        <dt className="text-xs text-muted-foreground">{key}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit lead</DialogTitle>
            <DialogDescription>Update standard, social, and custom information.</DialogDescription>
          </DialogHeader>
          {editing ? (
            <LeadForm
              value={editing}
              onChange={(next) => setEditing(next as Lead)}
              onSave={() => save.mutate({ lead: editing, create: false })}
              saving={save.isPending}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={!!adding} onOpenChange={(open) => !open && setAdding(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add lead</DialogTitle>
            <DialogDescription>Create a complete lead record in this workspace.</DialogDescription>
          </DialogHeader>
          {adding ? (
            <LeadForm
              value={adding}
              onChange={(next) => setAdding(next as LeadDraft)}
              onSave={() => save.mutate({ lead: adding, create: true })}
              saving={save.isPending}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
