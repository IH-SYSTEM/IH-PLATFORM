import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { BUCKET } from "@/lib/files";
import { ROLE_LABELS } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 在職証明書・給与証明書（所得証明）を PDF で作り、本人の「書類」に入れる（報告窓口の「証明書の発行依頼」を承認したとき）。
 * 会社名・住所・代表者は会社マスタ（給与を払う会社）から。社印は印刷してから押す（枠だけ用意する）
 */
export type CertificateKind = "在職証明書" | "給与証明書（所得証明）";

const A4 = { w: 595.28, h: 841.89 };
const yen = (n: number) => `${Math.round(n).toLocaleString()}円`;
const jpDate = (d: string | null | undefined) => (d ? `${Number(d.slice(0, 4))}年${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日` : "—");

export async function issueCertificate(opts: { staffId: string; kind: CertificateKind; purpose: string; copies: number; issuedBy: string }) {
  const admin = createAdminClient();
  const { data: staff } = await admin
    .from("staff")
    .select("name, birthdate, address, hire_date, role, department_name, tax_company_id, store_id")
    .eq("id", opts.staffId)
    .single();
  if (!staff) throw new Error("staff not found");
  let companyId = staff.tax_company_id as string | null;
  if (!companyId && staff.store_id) companyId = (await admin.from("stores").select("company_id").eq("id", staff.store_id).single()).data?.company_id ?? null;
  const { data: company } = companyId ? await admin.from("companies").select("name, representative, zipcode, address, phone").eq("id", companyId).single() : { data: null };
  const { data: slips } =
    opts.kind === "給与証明書（所得証明）"
      ? await admin
          .from("salary_records")
          .select("year, month, total_payment, total_deduction, net_payment")
          .eq("staff_id", opts.staffId)
          .eq("status", "confirmed")
          .order("year", { ascending: false })
          .order("month", { ascending: false })
          .limit(12)
      : { data: [] };

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const dir = path.join(process.cwd(), "assets", "fonts");
  // 日本語フォントは丸ごと埋め込む（pdf-lib の部分埋め込みは日本語の字が抜けるため。PDFは約3.5MB）
  const regular = await pdf.embedFont(await readFile(path.join(dir, "NotoSansJP_400Regular.ttf")), { subset: false });
  const bold = regular;
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);

  for (let i = 0; i < Math.max(1, Math.min(opts.copies, 3)); i++) {
    const page = pdf.addPage([A4.w, A4.h]);
    const text = (s: string, x: number, y: number, size = 11, font: PDFFont = regular) => page.drawText(s, { x, y, size, font, color: rgb(0.1, 0.1, 0.12) });
    const right = (s: string, xRight: number, y: number, size = 11, font: PDFFont = regular) => text(s, xRight - font.widthOfTextAtSize(s, size), y, size, font);

    right(`発行日　${jpDate(today)}`, A4.w - 60, A4.h - 70, 10);
    const title = opts.kind === "在職証明書" ? "在　職　証　明　書" : "給　与　証　明　書";
    text(title, (A4.w - bold.widthOfTextAtSize(title, 22)) / 2, A4.h - 130, 22, bold);

    const rows: [string, string][] = [
      ["氏名", staff.name],
      ["生年月日", jpDate(staff.birthdate)],
      ["住所", staff.address || "—"],
      ["入社年月日", jpDate(staff.hire_date)],
      ["雇用形態", ROLE_LABELS[staff.role ?? ""] ?? "—"],
      ["所属", staff.department_name || "—"],
    ];
    let y = A4.h - 190;
    for (const [k, v] of rows) {
      text(k, 80, y, 11, bold);
      text(v, 190, y, 11);
      page.drawLine({ start: { x: 75, y: y - 7 }, end: { x: A4.w - 75, y: y - 7 }, thickness: 0.4, color: rgb(0.75, 0.75, 0.78) });
      y -= 30;
    }

    y -= 10;
    if (opts.kind === "給与証明書（所得証明）") y = salaryTable(page, regular, bold, slips ?? [], y);
    const statement = opts.kind === "在職証明書" ? "上記の者は、当社に在職していることを証明します。" : "上記の者に対する給与の支給額を証明します。";
    text(statement, 80, y - 10, 12);
    text(`（使い道：${opts.purpose || "—"}）`, 80, y - 34, 10);

    // 会社（右下）と社印の枠
    let cy = 200;
    const lines = [company?.zipcode ? `〒${company.zipcode}` : "", company?.address ?? "", company?.name ?? "（会社名が会社マスタに未登録）", company?.representative ? `代表取締役　${company.representative}` : "", company?.phone ? `TEL ${company.phone}` : ""].filter(Boolean);
    for (const l of lines) {
      text(l, 270, cy, l === company?.name ? 12 : 10, l === company?.name ? bold : regular);
      cy -= 20;
    }
    page.drawRectangle({ x: A4.w - 125, y: 210, width: 60, height: 60, borderColor: rgb(0.8, 0.2, 0.2), borderWidth: 0.6, opacity: 0 });
    right("印", A4.w - 89, 235, 12);
  }

  const bytes = await pdf.save();
  const filePath = `certificate/${opts.staffId}/${randomUUID()}.pdf`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(filePath, bytes, { contentType: "application/pdf" });
  if (upErr) throw new Error(upErr.message);
  const name = `${opts.kind === "在職証明書" ? "在職証明書" : "給与証明書"}_${today}.pdf`;
  const { data: file, error } = await admin
    .from("files")
    .insert({ path: filePath, category: "certificate", owner_staff_id: opts.staffId, name, content_type: "application/pdf", size_bytes: bytes.length, status: "ready", visible_to_owner: true, uploaded_by: opts.issuedBy })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { fileId: file.id as string, name, missingCompany: !company?.address || !company?.representative };
}

function salaryTable(page: PDFPage, regular: PDFFont, bold: PDFFont, slips: { year: number; month: number; total_payment: number; total_deduction: number; net_payment: number }[], top: number) {
  const cols = [80, 200, 320, 430];
  const heads = ["支給年月", "総支給額", "控除額", "差引支給額"];
  const draw = (s: string, x: number, y: number, f: PDFFont, alignRight: boolean) =>
    page.drawText(s, { x: alignRight ? x + 95 - f.widthOfTextAtSize(s, 10) : x, y, size: 10, font: f, color: rgb(0.1, 0.1, 0.12) });
  let y = top;
  heads.forEach((h, i) => draw(h, cols[i], y, bold, i > 0));
  y -= 18;
  const rows = [...slips].reverse();
  for (const s of rows) {
    draw(`${s.year}年${s.month}月`, cols[0], y, regular, false);
    draw(yen(Number(s.total_payment)), cols[1], y, regular, true);
    draw(yen(Number(s.total_deduction)), cols[2], y, regular, true);
    draw(yen(Number(s.net_payment)), cols[3], y, regular, true);
    y -= 16;
  }
  if (!rows.length) {
    draw("確定した給与の記録がありません", cols[0], y, regular, false);
    y -= 16;
  } else {
    const sum = (k: "total_payment" | "total_deduction" | "net_payment") => rows.reduce((a, r) => a + Number(r[k]), 0);
    page.drawLine({ start: { x: 75, y: y + 10 }, end: { x: 530, y: y + 10 }, thickness: 0.4, color: rgb(0.6, 0.6, 0.65) });
    draw(`合計（${rows.length}か月）`, cols[0], y - 4, bold, false);
    draw(yen(sum("total_payment")), cols[1], y - 4, bold, true);
    draw(yen(sum("total_deduction")), cols[2], y - 4, bold, true);
    draw(yen(sum("net_payment")), cols[3], y - 4, bold, true);
    y -= 24;
  }
  return y - 10;
}
