"use server";

import { revalidatePath } from "next/cache";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser, isStaff } from "@/lib/auth";
import {
  notifyAccountManagerOfComment,
  notifyCustomersOfStaffComment,
} from "@/lib/notifications/dispatch";

export interface CommentResult {
  ok?: boolean;
  error?: string;
}

/**
 * Post a comment on an order's shared thread. Uses the caller's RLS client so
 * insertion is gated by can_view_load + author = self. A new CUSTOMER comment
 * notifies the load's assigned Account Manager (Epic 10).
 */
export async function postCommentAction(loadId: number, body: string): Promise<CommentResult> {
  const actor = await getCurrentUser();
  if (!actor) return { error: "Not signed in." };
  const text = body.trim();
  if (!text) return { error: "Comment can't be empty." };
  if (text.length > 4000) return { error: "Comment is too long." };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("comments")
    .insert({ load_id: loadId, author_id: actor.id, body: text });
  if (error) return { error: error.message };

  // Route the new comment in-app: a customer comment goes to the assigned
  // Account Manager; a UDTL reply goes to the load's customer users.
  if (isStaff(actor.role)) {
    await notifyCustomersOfStaffComment(loadId, actor.id);
  } else {
    await notifyAccountManagerOfComment(loadId, actor.id);
  }

  revalidatePath(`/portal/orders/${loadId}`);
  revalidatePath(`/ops/loads/${loadId}`);
  return { ok: true };
}

/** Mark this load's comment thread as read for the caller (clears the unread badge). */
export async function markCommentsReadAction(loadId: number): Promise<void> {
  const actor = await getCurrentUser();
  if (!actor) return;
  const admin = createServiceClient();
  await admin
    .from("comment_reads")
    .upsert(
      { user_id: actor.id, load_id: loadId, last_read_at: new Date().toISOString() },
      { onConflict: "user_id,load_id" },
    );
}
