import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 勘定科目マスタ（2026-10-22）。経理が画面（本部 › 勘定科目）から増やせる。名前はマネーフォワードの勘定科目と同じにする。
 * hint は AI が振り分けるときの目安
 */
export type AccountTitle = { name: string; hint: string | null; sort: number; active: boolean };

// 表がまだないとき（マイグレーション前）に使う、これまでの勘定科目
const FALLBACK = ["材料仕入", "酒類仕入", "店舗消耗品費", "消耗備品費", "事務用品費", "衛生費", "修繕費", "通信費", "水道光熱費", "車両費", "旅費交通費", "支払手数料", "広告宣伝費", "接待交際費", "会議費", "福利厚生費", "新聞図書費", "荷造運賃", "租税公課", "管理諸費", "雑費"];

export const allAccountTitles = cache(async function allAccountTitles(): Promise<AccountTitle[]> {
  const { data, error } = await createAdminClient().from("account_titles").select("name, hint, sort, active").order("sort").order("name");
  if (error || !data?.length) return FALLBACK.map((name, i) => ({ name, hint: null, sort: i, active: true }));
  return data;
});

/** 使っている勘定科目の名前（選ぶ欄・AI の候補） */
export const accountTitleNames = async () => (await allAccountTitles()).filter((a) => a.active).map((a) => a.name);

/** AI への目安（「家賃・テナント料 → 地代家賃」のように） */
export async function accountGuide() {
  const list = (await allAccountTitles()).filter((a) => a.active);
  return `勘定科目は次のどれか：${list.map((a) => a.name).join("・")}
  目安：${list.filter((a) => a.hint).map((a) => `${a.hint} → ${a.name}`).join("／")}`;
}
