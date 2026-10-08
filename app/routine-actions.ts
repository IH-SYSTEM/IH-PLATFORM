"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** 手で終わらせる定型業務に「済」をつける（担当者だけ） */
export async function markRoutineDone(routineId: string, periodStart: string) {
  const me = await requireAdmin();
  const admin = createAdminClient();
  const { data: r } = await admin.from("routines").select("assignee_ids, check_kind").eq("id", routineId).single();
  if (!r || r.check_kind !== "manual" || !(r.assignee_ids as string[]).includes(me.id)) return;
  await admin.from("routine_done").upsert({ routine_id: routineId, period_start: periodStart, done_by: me.id });
  revalidatePath("/");
}
