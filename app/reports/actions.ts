"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { distanceMeters, DEFAULT_DISPLAY_RADIUS_M } from "@/lib/punch";
import { parsePayload } from "@/lib/reports/fields";
import { reportType } from "@/lib/reports/registry";
import { createAdminClient } from "@/lib/supabase/admin";

export type SubmitState = { error?: string; at?: number } | undefined;

/**
 * 報告の送信。入力欄の定義どおりに読み取り、対象スタッフと店舗、報告者の位置を確かめてから保存する。
 * 反映（勤怠への記録など）は本部が承認したときに行う
 */
export async function submitReport(typeKey: string, _prev: SubmitState, fd: FormData): Promise<SubmitState> {
  const me = await requireStaff();
  const type = reportType(typeKey);
  if (!type) return { error: "この報告の種類は使えません", at: Date.now() };
  const fail = (error: string) => ({ error, at: Date.now() });

  const parsed = parsePayload(type.fields, (k) => {
    const v = fd.get(k);
    return typeof v === "string" ? v : null;
  });
  if ("error" in parsed) return fail(parsed.error);
  const payload = parsed.payload;

  const admin = createAdminClient();
  const storeId = String(fd.get("store") ?? "");
  const { data: store } = await admin.from("stores").select("id, lat, lng, geofence_radius, is_active").eq("id", storeId).maybeSingle();
  if (!store?.is_active) return fail("店舗を選んでください");

  let subjectId: string | null = null;
  if (type.subjectField) {
    subjectId = String(payload[type.subjectField]);
    if (subjectId === me.id) return fail("自分自身の報告はできません。その場にいるほかのスタッフに報告してもらってください");
    const { data: subject } = await admin.from("staff").select("id, retired").eq("id", subjectId).maybeSingle();
    if (!subject || subject.retired) return fail("対象のスタッフが見つかりません");
  }

  // 報告者がその場（店舗の打刻範囲内）にいたことを確かめる
  const lat = Number(fd.get("lat"));
  const lng = Number(fd.get("lng"));
  let distance: number | null = null;
  if (store.lat !== null && store.lng !== null && fd.get("lat") && Number.isFinite(lat) && Number.isFinite(lng)) {
    distance = Math.round(distanceMeters(store.lat, store.lng, lat, lng));
  }
  const radius = store.geofence_radius ?? DEFAULT_DISPLAY_RADIUS_M;
  if (type.onSiteOnly) {
    if (store.lat === null || store.lng === null) return fail("この店舗は位置が未登録のため、報告を受け付けられません。本部に連絡してください");
    if (distance === null) return fail("位置情報を確認できませんでした。位置情報の利用を許可してから、もう一度送信してください");
    if (distance > radius) return fail(`店舗から約${distance}m離れています。この報告は、店舗の${radius}m以内でだけ送れます`);
  }

  const { error } = await admin.from("reports").insert({
    type: type.key,
    type_version: type.version,
    category: type.category,
    store_id: store.id,
    reporter_id: me.id,
    subject_staff_id: subjectId,
    payload,
    on_site: distance === null ? null : distance <= radius,
    distance_m: distance,
  });
  if (error) {
    console.error("submitReport failed", error);
    return fail("送信できませんでした。時間をおいてもう一度お試しください");
  }
  redirect("/reports?sent=1");
}
