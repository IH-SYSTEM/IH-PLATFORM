import "server-only";
import type { CurrentStaff } from "@/lib/auth";
import { isCeo } from "@/lib/auth";

/**
 * 担当（2026-10-10 黒田さん決定）。権限は「立場（見られる範囲）」と「担当（入力・承認できる仕事）」の2本。
 * 管理者でも担当がなければ見るだけ。代表も見るだけで、承認（給与の確定・報告の承認）だけはできる。
 * 担当の中身は DB の duties 表にもある（説明文・一緒に持てない組み合わせ）。ここはアプリで使う名前の一覧
 */
export type DutyKey = "keiri_input" | "keiri_approve" | "soumu" | "jinji" | "system";

export const DUTY_LABELS: Record<DutyKey, string> = {
  keiri_input: "経理（入力）",
  keiri_approve: "経理（承認）",
  soumu: "総務",
  jinji: "人事・教育",
  system: "システム",
};

/** 同じ人が一緒に持てない担当（入力した人が自分で確定できないように） */
export const DUTY_EXCLUSIVE: Partial<Record<DutyKey, DutyKey[]>> = {
  keiri_input: ["keiri_approve"],
  keiri_approve: ["keiri_input"],
};

/** その担当の入力ができるか（管理者で、その担当を持っている人だけ） */
export const hasDuty = (me: CurrentStaff, ...keys: DutyKey[]) => me.isAdmin && keys.some((k) => me.duties.includes(k));

/** 承認ができるか（その担当の人か、代表） */
export const canApprove = (me: CurrentStaff, ...keys: DutyKey[]) => hasDuty(me, ...keys) || isCeo(me);

/** 立場と担当を割り当てられるか（システム担当か、代表）。自分のものは誰も変えられない */
export const canAssign = (me: CurrentStaff) => hasDuty(me, "system") || isCeo(me);

/** 担当がないときに画面と処理で出す言葉 */
export const noDutyMessage = (...keys: DutyKey[]) => `この操作は「${keys.map((k) => DUTY_LABELS[k]).join("」か「")}」の担当の人だけができます（見ることはできます）`;

/** 組み合わせの確認。持てない組み合わせがあれば、その説明を返す */
export function dutyConflict(keys: DutyKey[]): string | null {
  for (const k of keys) {
    const bad = (DUTY_EXCLUSIVE[k] ?? []).find((x) => keys.includes(x));
    if (bad) return `「${DUTY_LABELS[k]}」と「${DUTY_LABELS[bad]}」は同じ人が持てません（入力した人が自分で確定しないため）`;
  }
  return null;
}
