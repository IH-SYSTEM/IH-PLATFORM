import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** 送る相手の条件。種類どうしは「かつ」、同じ種類の中は「または」。何も選ばなければ全員（在籍者） */
export type Segment = { companies?: string[]; stores?: string[]; roles?: string[]; managersOnly?: boolean; staffIds?: string[] };
export type Recipient = { id: string; name: string; lineUserId: string | null };

export async function resolveSegment(seg: Segment): Promise<Recipient[]> {
  const admin = createAdminClient();
  const [{ data: staff }, { data: stores }] = await Promise.all([
    admin.from("staff").select("id, name, role, permission, store_id, line_user_id, line_friend, retired").eq("retired", false),
    admin.from("stores").select("id, company_id, manager_staff_ids"),
  ]);
  const companyOf = new Map((stores ?? []).map((s) => [s.id, s.company_id as string | null]));
  const managers = new Set((stores ?? []).flatMap((s) => (s.manager_staff_ids as string[]) ?? []));
  return (staff ?? [])
    .filter((p) => !seg.staffIds?.length || seg.staffIds.includes(p.id))
    .filter((p) => !seg.companies?.length || (!!p.store_id && seg.companies.includes(companyOf.get(p.store_id) ?? "")))
    .filter((p) => !seg.stores?.length || (!!p.store_id && seg.stores.includes(p.store_id)))
    .filter((p) => !seg.roles?.length || seg.roles.includes(p.role ?? ""))
    .filter((p) => !seg.managersOnly || p.permission === "store" || managers.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, lineUserId: p.line_user_id && p.line_friend !== false && !p.line_user_id.startsWith("TEST-") ? p.line_user_id : null }));
}
