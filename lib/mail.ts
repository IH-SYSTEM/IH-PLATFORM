import "server-only";
import nodemailer from "nodemailer";

/**
 * 会社のメール（noreply@ikkou-holdings.co.jp・コアサーバー）から送る。
 * SMTP_HOST は証明書の名前に合わせて v2001.coreserver.jp にする（mail.ikkou-holdings.co.jp だと暗号化の確認で弾かれる）。
 * 環境変数: SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM（表示名つき差出人・任意）
 */
export async function sendMail(opts: { to: string; subject: string; text: string; html?: string }) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new Error("SMTP の環境変数が未設定です");
  const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass }, connectionTimeout: 10_000 });
  await transport.sendMail({ from: process.env.SMTP_FROM || `IKKOU HOLDINGS <${user}>`, ...opts });
}
