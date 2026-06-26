import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { isStaff, type UserRole } from "@/lib/auth";
import type { CommentItem } from "@/components/comment-thread";

/**
 * A load's comment thread, enriched with author display + role. Read via the
 * service role (callers gate access by their own load read first), so a
 * customer can also see the names of UDTL staff who replied — rows they
 * couldn't read directly through the users RLS.
 */
export async function fetchComments(loadId: number, viewerId: string): Promise<CommentItem[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("comments")
    .select("id, body, created_at, author:author_id ( id, name, email, role )")
    .eq("load_id", loadId)
    .order("created_at", { ascending: true });

  return ((data ?? []) as Record<string, unknown>[]).map((c) => {
    const a = (c.author ?? {}) as { id?: string; name?: string | null; email?: string | null; role?: string };
    return {
      id: c.id as number,
      body: c.body as string,
      at: c.created_at as string,
      authorName: a.name || a.email || "Unknown",
      authorIsStaff: a.role ? isStaff(a.role as UserRole) : false,
      isMine: a.id === viewerId,
    };
  });
}
