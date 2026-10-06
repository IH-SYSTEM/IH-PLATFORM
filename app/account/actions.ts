"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function unlinkLine() {
  const me = await requireStaff();
  await createAdminClient().from("staff").update({ line_user_id: null, line_connected_at: null }).eq("id", me.id);
  redirect("/account?line=unlinked");
}
