// 固定残業（みなし残業）と36協定の上限（2026-10-16 黒田さん決定）。テストから Node で直接読むため、ここでは他のファイルを import しない
//
//   対象      … 正社員（月給）だけ
//   固定残業  … 基本給のうち 45,000円 が固定残業手当（30時間分）。明細では「基本給」と「固定残業手当」に分けて出す
//   割増の単価 … 固定残業手当を除いた基本給 ÷ 173時間（固定残業手当は割増の基礎に入れない）
//   超えた分  … 次のどちらか大きいほうを「時間外手当」として払う
//                 ① 30時間を超えた時間 × 単価 × 1.25
//                 ② 実際の残業代（全部の時間 × 単価 × 1.25）− 固定残業手当（固定残業手当が30時間分に足りないときの不足）
//   週40時間  … 週（月〜日）40時間を超えた分は残業（worktime.ts で数える）
//   36協定    … 残業は月45時間・年360時間まで。近づいたら店長と総務・代表に LINE

export const FIXED_OVERTIME_YEN = 45_000;
export const FIXED_OVERTIME_HOURS = 30;
export const FIXED_OVERTIME_ROLES = ["fulltime"];
export const MONTHLY_LIMIT_HOURS = 45;
export const YEARLY_LIMIT_HOURS = 360;
/** 36協定の1年の始まりの月（4月〜翌3月） */
export const AGREEMENT_START_MONTH = 4;

export const usesFixedOvertime = (role: string | null | undefined, type: string | null | undefined) => type === "monthly" && !!role && FIXED_OVERTIME_ROLES.includes(role);

/**
 * 固定残業の人の割増。monthly は基本給（固定残業手当を含む全額）。share は月の途中で金額が変わったときの、その期間の割合（日数）
 */
export function fixedOvertimePremiums(monthly: number, minutes: { overtime: number; night: number; holiday: number }, share = 1) {
  const fixed = Math.round(Math.min(FIXED_OVERTIME_YEN, monthly) * share);
  const unit = (monthly - Math.min(FIXED_OVERTIME_YEN, monthly)) / 173;
  const h = (m: number) => m / 60;
  const actual = h(minutes.overtime) * unit * 1.25;
  const overHours = Math.max(0, h(minutes.overtime) - FIXED_OVERTIME_HOURS * share) * unit * 1.25;
  return {
    fixed,
    overtimePay: Math.round(Math.max(0, overHours, actual - fixed)),
    nightPay: Math.round(h(minutes.night) * unit * 0.25),
    holidayPay: Math.round(h(minutes.holiday) * unit * 1.35),
  };
}

/** 36協定の1年の始まりの日（その日を含む年） */
export function agreementYearStart(ymd: string) {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  return `${m >= AGREEMENT_START_MONTH ? y : y - 1}-${String(AGREEMENT_START_MONTH).padStart(2, "0")}-01`;
}

/** 知らせる段階：月 36時間（8割）・45時間（上限）／年 300時間・360時間 */
export function overtimeLevels(monthMinutes: number, yearMinutes: number) {
  const out: { key: string; text: string }[] = [];
  const mh = monthMinutes / 60;
  const yh = yearMinutes / 60;
  if (mh >= MONTHLY_LIMIT_HOURS) out.push({ key: "m45", text: `今月の残業が${MONTHLY_LIMIT_HOURS}時間（36協定の上限）に達しました` });
  else if (mh >= 36) out.push({ key: "m36", text: `今月の残業が36時間を超えました（上限は${MONTHLY_LIMIT_HOURS}時間）` });
  if (yh >= YEARLY_LIMIT_HOURS) out.push({ key: "y360", text: `今年度の残業が${YEARLY_LIMIT_HOURS}時間（36協定の上限）に達しました` });
  else if (yh >= 300) out.push({ key: "y300", text: `今年度の残業が300時間を超えました（上限は${YEARLY_LIMIT_HOURS}時間）` });
  return out;
}
