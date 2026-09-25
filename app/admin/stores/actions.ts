"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type StoreSaveState = { ok?: boolean; error?: string; at?: number } | undefined;

class InputError extends Error {}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export async function saveStore(storeId: string | null, _prev: StoreSaveState, fd: FormData): Promise<StoreSaveState> {
  const me = await requireAdmin();
  const supabase = await createClient();
  let createdId: string | null = null;

  try {
    const text = (k: string) => {
      const v = String(fd.get(k) ?? "").trim();
      return v === "" ? null : v;
    };
    const num = (k: string, label: string, { min = 0, max = Infinity, integer = true } = {}) => {
      const v = text(k);
      if (v === null) return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
        throw new InputError(`${label}の値が正しくありません`);
      }
      return n;
    };
    const time = (k: string, label: string) => {
      const v = text(k);
      if (v && !TIME.test(v)) throw new InputError(`${label}は「09:00」の形式で入力してください`);
      return v;
    };
    const percent = (k: string, label: string) => {
      const n = num(k, label, { max: 100, integer: false });
      return n === null ? null : Math.round(n * 1000) / 100000;
    };

    const name = text("name");
    if (!name) throw new InputError("店舗名を入力してください");

    const allowedIps = (text("allowed_ips") ?? "")
      .split(/[\s,、]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const badIp = allowedIps.find((ip) => !IPV4.test(ip) && !ip.includes(":"));
    if (badIp) throw new InputError(`許可IPアドレス「${badIp}」の形式が正しくありません`);

    const { data: same } = await supabase.from("stores").select("id").eq("name", name);
    if ((same ?? []).some((s) => s.id !== storeId)) throw new InputError("同じ名前の店舗がすでにあります");

    const managerIds = fd.getAll("manager_staff_ids").map(String);

    const row = {
      name,
      address: text("address"),
      sort_order: num("sort_order", "表示順"),
      lat: num("lat", "緯度", { min: -90, max: 90, integer: false }),
      lng: num("lng", "経度", { min: -180, max: 180, integer: false }),
      open_time: time("open_time", "開店時刻"),
      close_time: time("close_time", "閉店時刻"),
      monthly_holidays: num("monthly_holidays", "月の公休日数", { max: 31 }),
      default_paid_leave: num("default_paid_leave", "有給休暇の初期日数", { max: 40 }),
      target_labor_cost_rate: percent("target_labor_cost_rate", "目標人件費率"),
      rosai_rate: percent("rosai_rate", "労災保険料率"),
      scheduled_clock_out: time("scheduled_clock_out", "定時退勤時刻"),
      notification_delay_min: num("notification_delay_min", "退勤忘れ通知", { max: 600 }),
      geofence_enabled: fd.get("geofence_enabled") === "on",
      geofence_radius: num("geofence_radius", "打刻可能範囲", { max: 5000 }),
      wifi_enabled: fd.get("wifi_enabled") === "on",
      allowed_ips: allowedIps,
      manager_staff_ids: managerIds,
      is_active: fd.get("is_active") === "on",
      updated_by: me.id,
    };

    if (storeId) {
      const { data: before } = await supabase.from("stores").select("name").eq("id", storeId).single();
      if (!before) throw new InputError("店舗が見つかりません");
      const { error } = await supabase.from("stores").update(row).eq("id", storeId);
      if (error) throw new Error(error.message);
      if (before.name !== name) {
        const { error: e2 } = await supabase.from("staff").update({ department_name: name }).eq("store_id", storeId);
        if (e2) throw new Error(e2.message);
      }
    } else {
      const { data, error } = await supabase
        .from("stores")
        .insert({ ...row, is_active: true, created_by: me.id })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      createdId = data.id;
    }
  } catch (e) {
    if (e instanceof InputError) return { error: e.message, at: Date.now() };
    console.error("saveStore failed", e);
    return { error: "保存に失敗しました。時間をおいてもう一度お試しください", at: Date.now() };
  }

  revalidatePath("/admin/stores");
  revalidatePath("/admin/staff");
  revalidatePath("/admin");
  if (createdId) redirect(`/admin/stores/${createdId}?created=1`);
  revalidatePath(`/admin/stores/${storeId}`);
  return { ok: true, at: Date.now() };
}
