import "server-only";
import ExcelJS from "exceljs";
import { parseCsv } from "@/lib/pos/csv";

/**
 * 表のファイル（CSV・Excel）を、見出しと行に読む。文字コードは UTF-8（BOM あり・なし）か Shift_JIS を自動で見分ける。
 * Excel は中身のある最初のシートを読む（見出しは、空でない最初の行）
 */
export type Table = { header: string[]; rows: string[][]; sheet?: string };

function decodeText(buf: Buffer): string {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString("utf8");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("shift_jis").decode(buf);
  }
}

export const isTableType = (contentType: string) =>
  contentType === "text/csv" ||
  contentType === "application/vnd.ms-excel" ||
  contentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const cellText = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    return "";
  }
  return String(v);
};

export async function readTable(buf: Buffer, contentType: string): Promise<Table | { error: string }> {
  if (contentType === "text/csv") {
    const rows = parseCsv(decodeText(buf)).filter((r) => r.some((c) => c.trim()));
    if (rows.length < 2) return { error: "表の中身がありません" };
    return { header: rows[0].map((h) => h.trim()), rows: rows.slice(1) };
  }
  if (contentType === "application/vnd.ms-excel") return { error: "古い Excel（.xls）は読めません。.xlsx か CSV で保存して入れてください" };
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  for (const ws of wb.worksheets) {
    const all: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = (row.values as ExcelJS.CellValue[]).slice(1).map(cellText);
      if (vals.some((c) => c.trim())) all.push(vals);
    });
    if (all.length >= 2) {
      const width = Math.max(...all.map((r) => r.length));
      const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
      return { header: pad(all[0]).map((h) => h.trim()), rows: all.slice(1).map(pad), sheet: ws.name };
    }
  }
  return { error: "表の中身がありません" };
}

/** 数字として読む（カンマ・円・％・全角を許す）。読めなければ null */
export function toNumber(v: string): number | null {
  const s = v
    .replace(/[０-９．－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,¥￥円\s%％]/g, "")
    .replace(/^\((.*)\)$/, "-$1")
    .replace(/^▲/, "-");
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** 日付として読む（2026/8/1・2026-08-01・20260801・2026年8月1日・2026/8 → 月初）。読めなければ null */
export function toDate(v: string): string | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})[/\-年.](\d{1,2})[/\-月.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{4})[/\-年.](\d{1,2})月?$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-01`;
  return null;
}
