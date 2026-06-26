"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { postCommentAction, markCommentsReadAction } from "@/app/comments/actions";

export interface CommentItem {
  id: number;
  body: string;
  at: string;
  authorName: string;
  authorIsStaff: boolean;
  isMine: boolean;
}

const fmt = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Winnipeg",
});

/** Two-way customer ↔ UDTL comment thread on an order (Epic 10). */
export function CommentThread({
  loadId,
  comments,
  viewerIsStaff,
}: {
  loadId: number;
  comments: CommentItem[];
  viewerIsStaff: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const marked = useRef(false);

  // Mark the thread read for this viewer when they open the order.
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    void markCommentsReadAction(loadId);
  }, [loadId]);

  function post() {
    const t = text.trim();
    if (!t) return;
    startTransition(async () => {
      const res = await postCommentAction(loadId, t);
      if (res.error) toast.error(res.error);
      else {
        setText("");
        router.refresh();
      }
    });
  }

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-slate-800">Comments</h2>
      <p className="mt-0.5 text-xs text-slate-500">
        {viewerIsStaff
          ? "Messages here are visible to the customer."
          : "Chat with the UDTL team about this order."}
      </p>

      <div className="mt-4 max-h-[26rem] space-y-3 overflow-y-auto">
        {comments.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            No comments yet — start the conversation.
          </p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className={`flex flex-col ${c.isMine ? "items-end" : "items-start"}`}>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-slate-700">{c.isMine ? "You" : c.authorName}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    c.authorIsStaff
                      ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                      : "bg-[var(--color-secondary)]/10 text-[var(--color-secondary)]"
                  }`}
                >
                  {c.authorIsStaff ? "UDTL" : "Customer"}
                </span>
                <span className="text-slate-400">{fmt.format(new Date(c.at))}</span>
              </div>
              <p
                className={`mt-1 max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                  c.isMine ? "bg-[var(--color-secondary)]/10 text-slate-800" : "bg-slate-100 text-slate-800"
                }`}
              >
                {c.body}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Write a comment…"
          disabled={pending}
          className="flex-1 resize-none rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none transition focus:border-[var(--color-secondary)] focus:ring-2 focus:ring-[var(--color-secondary)]/20"
        />
        <button
          type="button"
          onClick={post}
          disabled={pending || !text.trim()}
          className="rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-secondary-700)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Posting…" : "Post"}
        </button>
      </div>
    </div>
  );
}
