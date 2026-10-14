/**
 * エアレジの「会計明細」CSV（売上・分析 → 日別売上 → CSVデータをダウンロード → 会計明細）を読む。
 * 1つの会計は「合計が入った先頭の行」＋「注文ごとの行」（合計の欄は空）で並ぶ。
 * 文字コードは Shift_JIS（読む前に TextDecoder("shift_jis") で文字列にしておく）
 */
import { parseCsv } from "./csv.ts";

export type PosLine = { category: string; name: string; price: number; qty: number; discount: number };
export type PosReceipt = {
  receiptNo: string;
  businessDate: string; // YYYY-MM-DD（6:00 区切りの営業日）
  checkoutAt: string; // ISO（JST）
  total: number;
  tax: number;
  people: number;
  items: number;
  discount: number;
  payments: Record<string, number>;
  cashier: string;
  slip: string;
  lines: PosLine[];
};

// 支払い方法の列（金額が入っているものだけ payments に入れる）。現金はおつりを引いた額にする
const PAYMENT_COLUMNS = [
  "現金",
  "クレジットカード(Airペイ)",
  "交通系電子マネー(Airペイ)",
  "QUICPay(Airペイ)",
  "iD(Airペイ)",
  "QR決済(Airペイ QR)",
  "クレジットカード/電子マネー(Square)",
  "ポイント(Airペイ ポイント)",
  "ポイント(ホットペッパーグルメ)",
  "Pontaポイント(Airウォレット)",
  "楽天",
  "PayPay",
  "金券合計",
  "売掛合計",
];
const REQUIRED = ["取引No", "会計日", "会計時間", "修正後合計", "人数", "メニュー名"];

const num = (v: string | undefined) => {
  const n = Number(String(v ?? "").replace(/[,¥\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** 会計日・会計時間から営業日（6:00 より前は前日） */
export function businessDateOf(date: string, time: string) {
  const d = date.replaceAll("/", "-");
  if (Number(time.slice(0, 2)) >= 6) return d;
  return new Date(Date.parse(`${d}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

export function parseAirRegi(text: string): { receipts: PosReceipt[]; error?: string } {
  const rows = parseCsv(text);
  const header = rows[0] ?? [];
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) return { receipts: [], error: "エアレジの「会計明細」CSVではないようです（列が足りません）" };
  const col = (r: string[], name: string) => r[header.indexOf(name)] ?? "";

  const receipts: PosReceipt[] = [];
  let current: PosReceipt | null = null;
  for (const r of rows.slice(1)) {
    if (r.length < header.length / 2) continue; // 空行
    const no = col(r, "取引No");
    if (col(r, "会計日")) {
      const date = col(r, "会計日");
      const time = col(r, "会計時間") || "12:00:00";
      const payments: Record<string, number> = {};
      for (const p of PAYMENT_COLUMNS) {
        const v = p === "現金" ? num(col(r, p)) - num(col(r, "おつり")) : num(col(r, p));
        if (v) payments[p] = v;
      }
      current = {
        receiptNo: no,
        businessDate: businessDateOf(date, time),
        checkoutAt: `${date.replaceAll("/", "-")}T${time}+09:00`,
        total: num(col(r, "修正後合計")),
        tax: num(col(r, "修正後内消費税")),
        people: num(col(r, "人数")),
        items: num(col(r, "商品点数")),
        discount: num(col(r, "割引/割増合計(税込)")),
        payments,
        cashier: col(r, "レジ担当者名"),
        slip: col(r, "伝票名"),
        lines: [],
      };
      receipts.push(current);
    }
    if (current && no === current.receiptNo && col(r, "メニュー名")) {
      current.lines.push({
        category: col(r, "カテゴリー名"),
        name: col(r, "メニュー名"),
        price: num(col(r, "価格")),
        qty: num(col(r, "注文数量")),
        discount: num(col(r, "個別割引/割増合計額")),
      });
    }
  }
  return { receipts };
}

/**
 * エアレジの「売上集計」CSV（日ごとの合計。過去の分はこれしかないことがある）を、1日1行の会計として読む。
 * 列：集計期間（YYYYMMDD）・売上・会計数・客数・商品数・現金支払合計額・現金その他支払合計額・割引額 など。
 * 同じ日に「会計明細」があれば、そちらを優先する（取り込むときに、明細のある日は入れない・明細を入れたら日計を消す）
 */
export const DAILY_PREFIX = "daily-";
export function parseAirRegiDaily(text: string, storeId: string): { receipts: PosReceipt[]; error?: string } {
  const rows = parseCsv(text);
  const header = rows[0] ?? [];
  if (!["集計期間", "売上", "客数"].every((c) => header.includes(c))) return { receipts: [], error: "エアレジの「会計明細」か「売上集計」のCSVを選んでください（列が足りません）" };
  const col = (r: string[], name: string) => r[header.indexOf(name)] ?? "";
  const receipts: PosReceipt[] = [];
  for (const r of rows.slice(1)) {
    const d = col(r, "集計期間").replace(/\D/g, "");
    if (d.length !== 8) continue; // 合計の行・空行
    const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    const total = num(col(r, "売上"));
    if (!total) continue; // 休みの日
    const payments: Record<string, number> = {};
    if (num(col(r, "現金支払合計額"))) payments["現金"] = num(col(r, "現金支払合計額"));
    if (num(col(r, "現金その他支払合計額"))) payments["現金以外"] = num(col(r, "現金その他支払合計額"));
    receipts.push({
      // 店ごとに別の番号にする（別の店の取り違えの確認に引っかからないように）
      receiptNo: `${DAILY_PREFIX}${date}-${storeId}`,
      businessDate: date,
      checkoutAt: `${date}T23:59:00+09:00`,
      total,
      tax: 0,
      people: num(col(r, "客数")),
      items: num(col(r, "商品数")),
      discount: -Math.abs(num(col(r, "割引額"))),
      payments,
      cashier: "",
      slip: `${num(col(r, "会計数"))}会計`,
      lines: [],
    });
  }
  if (!receipts.length) return { receipts: [], error: "売上の入った日がありません" };
  return { receipts };
}
