import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FileSpreadsheet, UploadCloud, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
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

export const Route = createFileRoute("/_dash/import")({ component: ImportPage });
type UploadResult = {
  id: string;
  filename: string;
  headers: string[];
  preview: unknown[][];
  suggestedMapping: Record<string, string>;
};
type Job = {
  id: string;
  filename: string;
  status: string;
  totalRows: number;
  processedRows: number;
  importedRows: number;
  duplicateRows: number;
  failedRows: number;
  progress: number;
  error?: string;
};
const fields = [
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
  "other_social_links",
  "location",
  "country",
  "source",
  "status",
  "tags",
  "notes",
];

function ImportPage() {
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api<UploadResult>("import/upload.php", { method: "POST", body: form }).then(
        (r) => r.data,
      );
    },
    onSuccess: (data) => {
      setUpload(data);
      setMapping(data.suggestedMapping ?? {});
    },
    onError: (e) => toast.error(e.message),
  });
  const processMutation = useMutation({
    mutationFn: () =>
      api("import/process.php", { method: "POST", body: jsonBody({ id: upload?.id, mapping }) }),
    onSuccess: () => {
      setJobId(upload!.id);
      toast.success("Import queued for background processing");
    },
    onError: (e) => toast.error(e.message),
  });
  const status = useQuery({
    queryKey: ["import-status", jobId],
    queryFn: () =>
      api<Job>(`import/status.php?id=${encodeURIComponent(jobId!)}`).then((r) => r.data),
    enabled: !!jobId,
    refetchInterval: (q) =>
      ["COMPLETED", "FAILED"].includes(q.state.data?.status ?? "") ? false : 2000,
  });
  const accept = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["csv", "xls", "xlsx"].includes(ext)) {
      toast.error("Choose a CSV, XLS, or XLSX file.");
      return;
    }
    uploadMutation.mutate(file);
  };
  const job = status.data;
  return (
    <>
      <PageHeader
        title="Import Data"
        description="Upload, map, preview, and process leads in safe background batches."
      />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) accept(file);
        }}
        className={`surface-card flex flex-col items-center justify-center px-6 py-14 text-center transition-colors ${dragging ? "border-primary bg-accent/50" : ""}`}
      >
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <UploadCloud className="size-7" />
        </span>
        <h2 className="mt-4 text-lg font-semibold">Drag and drop your file here</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          CSV, XLSX, or XLS · up to the server-configured limit
        </p>
        <label className="mt-5">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) accept(file);
            }}
          />
          <span className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
            {uploadMutation.isPending ? "Uploading…" : "Browse files"}
          </span>
        </label>
      </div>
      {upload ? (
        <>
          <div className="surface-card p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-success/12 text-success">
                  <FileSpreadsheet className="size-5" />
                </span>
                <div>
                  <p className="font-medium">{upload.filename}</p>
                  <p className="text-sm text-muted-foreground">
                    {upload.headers.length} detected columns
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setUpload(null);
                  setJobId(null);
                }}
              >
                <X className="size-4" />
              </Button>
            </div>
            {job ? (
              <>
                <Progress value={job.progress} className="mt-4 h-2" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {job.status}: {job.processedRows} processed · {job.importedRows} imported ·{" "}
                  {job.duplicateRows} duplicates · {job.failedRows} failed
                </p>
                {job.error ? <p className="mt-2 text-sm text-destructive">{job.error}</p> : null}
                {job.failedRows > 0 && job.status === "COMPLETED" ? (
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <a href={`/api/import/failed-report.php?id=${encodeURIComponent(job.id)}`}>
                      Download failed rows
                    </a>
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
          <div className="surface-card overflow-hidden">
            <p className="border-b border-border px-5 py-4 font-semibold">
              Column mapping and preview
            </p>
            <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-3">
              {upload.headers.map((header, index) => (
                <div key={`${header}-${index}`} className="space-y-1">
                  <p className="truncate text-xs text-muted-foreground">
                    {header || `Column ${index + 1}`}
                  </p>
                  <Select
                    value={mapping[String(index)] ?? "skip"}
                    onValueChange={(value) =>
                      setMapping((current) => {
                        const next = { ...current };
                        if (value === "skip") delete next[String(index)];
                        else next[String(index)] = value;
                        return next;
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip">Skip column</SelectItem>
                      {fields.map((field) => (
                        <SelectItem key={field} value={field}>
                          {field}
                        </SelectItem>
                      ))}
                      {upload.suggestedMapping[String(index)]?.startsWith("custom:") ? (
                        <SelectItem value={upload.suggestedMapping[String(index)]!}>
                          Custom: {upload.suggestedMapping[String(index)]!.slice(7)}
                        </SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {upload.headers.map((header, index) => (
                      <TableHead key={index}>{header || `Column ${index + 1}`}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upload.preview.map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {upload.headers.map((_, index) => (
                        <TableCell key={index} className="whitespace-nowrap">
                          {String(row[index] ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end border-t border-border p-4">
              <Button
                disabled={
                  processMutation.isPending ||
                  !!jobId ||
                  (!Object.values(mapping).includes("first_name") &&
                    !Object.values(mapping).includes("full_name")) ||
                  !Object.values(mapping).includes("email")
                }
                onClick={() => processMutation.mutate()}
              >
                {processMutation.isPending ? "Queueing…" : jobId ? "Import queued" : "Start import"}
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
