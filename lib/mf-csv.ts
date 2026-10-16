import "server-only";
import iconv from "iconv-lite";

/**
 * マネーフォワード クラウド会計の「仕訳帳」の CSV（インポート用）を作る（2026-10-16 見本 仕訳帳_20261016_1058.csv に合わせる）。
 *   列は見本と同じ19列・同じ順。文字コードは Shift_JIS（見本と同じ）。日付は YYYY/MM/DD
 *   店の現金で払った経費：借方＝勘定科目（部門＝店）／貸方＝現金・補助科目「売上金」（部門＝店）
 *   会社の口座から振込（請求書）：借方＝勘定科目／貸方＝未払金・補助科目＝お店（取引先）
 *   税区分：10%＝「課税仕入 10%」、8%＝「課税仕入 (軽)8%」、対象外＝「対象外仕入」。貸方は「対象外」
 *   摘要：「勘定科目　お店　（何を買ったか）」（見本の書き方）
 */
export const MF_HEADER = ["取引No", "取引日", "借方勘定科目", "借方補助科目", "借方部門", "借方取引先", "借方税区分", "借方インボイス", "借方金額(円)", "貸方勘定科目", "貸方補助科目", "貸方部門", "貸方取引先", "貸方税区分", "貸方インボイス", "貸方金額(円)", "摘要", "タグ", "メモ"] as const;

export type MfExpense = {
  date: string; // YYYY-MM-DD
  account: string;
  department: string;
  vendor: string | null;
  item: string | null;
  amount: number;
  taxRate: number | null;
  payment: "cash" | "transfer";
};

const taxLabel = (rate: number | null) => (rate === 8 ? "課税仕入 (軽)8%" : rate === 0 ? "対象外仕入" : "課税仕入 10%");
const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

export function mfRows(list: MfExpense[]): string[][] {
  return list.map((e, i) => {
    const vendor = (e.vendor ?? "").slice(0, 60);
    const memo = [e.account, vendor, e.item ? `（${e.item}）` : ""].filter(Boolean).join("　").slice(0, 200);
    const credit =
      e.payment === "cash" ? { account: "現金", sub: "売上金", dept: e.department } : { account: "未払金", sub: vendor, dept: e.department };
    return [
      String(i + 1),
      e.date.replaceAll("-", "/"),
      e.account,
      "",
      e.department,
      "",
      taxLabel(e.taxRate),
      "",
      String(e.amount),
      credit.account,
      credit.sub,
      credit.dept,
      "",
      "対象外",
      "",
      String(e.amount),
      memo,
      "",
      "IHポータル",
    ];
  });
}

/** Shift_JIS の CSV（見本と同じ。全部の欄をダブルクォートで囲む・改行は LF） */
export function mfCsv(list: MfExpense[]): Buffer {
  const lines = [MF_HEADER as readonly string[], ...mfRows(list)].map((r) => r.map(q).join(","));
  return iconv.encode(`${lines.join("\n")}\n`, "Shift_JIS");
}
