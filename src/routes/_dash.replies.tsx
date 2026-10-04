import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Mail, MessageCircleReply, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, jsonBody } from "@/lib/api";

type Reply = {
  id: string;
  senderEmail: string;
  senderName: string | null;
  subject: string | null;
  body: string;
  receivedAt: string;
  campaignId: string;
  campaignName: string;
  leadId: string;
  leadName: string;
  company: string | null;
};

export const Route = createFileRoute("/_dash/replies")({
  head: () => ({ meta: [{ title: "Email Replies — LeadPilot" }] }),
  component: RepliesPage,
});

const PAGE_SIZE = 20;

function RepliesPage() {
  const [page, setPage] = useState(1);
  const [replyingTo, setReplyingTo] = useState<Reply | null>(null);
  const [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: ["replies", page],
    queryFn: () => api<Reply[]>(`replies.php?page=${page}&per_page=${PAGE_SIZE}`),
    refetchInterval: 60_000,
  });
  const replies = query.data?.data ?? [];
  const total = Number(query.data?.meta["total"] ?? 0);
  const pages = Math.max(1, Number(query.data?.meta["pages"] ?? 1));
  const sendReply = useMutation({
    mutationFn: () =>
      api<{ status: string }>("replies/send.php", {
        method: "POST",
        body: jsonBody({ replyId: replyingTo?.id, body: message.trim() }),
      }),
    onSuccess: () => {
      toast.success("Reply sent");
      setReplyingTo(null);
      setMessage("");
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <>
      <PageHeader
        title="Email Replies"
        description={`${total.toLocaleString()} replies from your recipients.`}
      />
      {query.error ? <p className="text-sm text-destructive">{query.error.message}</p> : null}
      {query.isLoading ? <p className="text-sm text-muted-foreground">Checking replies…</p> : null}
      <div className="space-y-4">
        {replies.map((reply) => (
          <article key={reply.id} className="surface-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-semibold">
                  <MessageCircleReply className="size-4 text-primary" />
                  {reply.senderName || reply.leadName || reply.senderEmail}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Mail className="size-3.5" /> {reply.senderEmail}
                </p>
              </div>
              <time className="text-xs text-muted-foreground">{reply.receivedAt}</time>
            </div>
            <p className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted/45 p-3 text-sm leading-6 text-foreground/90">
              {reply.body || "Reply body was empty."}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">
                Campaign:{" "}
                <Link
                  to="/campaigns/$campaignId"
                  params={{ campaignId: reply.campaignId }}
                  className="font-medium text-primary hover:underline"
                >
                  {reply.campaignName}
                </Link>
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setReplyingTo(reply);
                  setMessage("");
                }}
              >
                <MessageCircleReply className="size-4" /> Reply
              </Button>
            </div>
          </article>
        ))}
        {!query.isLoading && replies.length === 0 ? (
          <div className="surface-card p-10 text-center">
            <MessageCircleReply className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-medium">No human replies yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Enable reply tracking on a Sending Account to monitor its inbox securely.
            </p>
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
      <Dialog
        open={!!replyingTo}
        onOpenChange={(open) => {
          if (!open && !sendReply.isPending) {
            setReplyingTo(null);
            setMessage("");
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Reply to {replyingTo?.senderName || replyingTo?.senderEmail}</DialogTitle>
            <DialogDescription>
              This sends a direct email from the same sending account. It will not create a
              campaign.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!message.trim()) return;
              sendReply.mutate();
            }}
          >
            <div className="rounded-lg border border-border bg-muted/35 p-3 text-sm">
              <span className="text-muted-foreground">To: </span>
              {replyingTo?.senderEmail}
            </div>
            <div className="space-y-2">
              <Label htmlFor="direct-reply-message">Message</Label>
              <Textarea
                id="direct-reply-message"
                rows={8}
                maxLength={10000}
                autoFocus
                placeholder="Write your reply…"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            </div>
            <Button className="w-full" disabled={!message.trim() || sendReply.isPending}>
              <Send className="size-4" /> {sendReply.isPending ? "Sending…" : "Send reply"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
