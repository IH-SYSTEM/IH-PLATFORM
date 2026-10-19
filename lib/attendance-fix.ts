import "server-only";
import type { CurrentStaff } from "@/lib/auth";
import { attendanceScope, inScope } from "@/lib/attendance";
import { reportType } from "@/lib/reports/registry";

/** 打刻の修正依頼を処理できるか（その店のシフト管理者・店長・本部。直される本人はできない）。できないときは理由 */
export async function cannotReviewFix(me: CurrentStaff, r: { store_id: string | null; subject_staff_id: string | null; type: string }) {
  if (!reportType(r.type)?.shiftManagerReview) return "この報告は、ここでは処理できません";
  if (r.subject_staff_id === me.id) return "自分の打刻の修正依頼は、自分では承認できません";
  const scope = await attendanceScope(me);
  if (!scope || !inScope(scope, r.store_id)) return "この店の修正依頼は処理できません";
  return null;
}

