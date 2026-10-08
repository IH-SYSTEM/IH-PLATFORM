"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendLine } from "@/lib/line-push";
import { resolveSegment, type Segment } from "@/lib/line-segment";

export type Preview = { total: number; linked: number; unlinked: string[] };
export type SendState = { ok?: string; error?: string; at?: number } | undefined;

const segmentOf = (fd: FormData): Segment => ({
  companies: fd.getAll("companies").map(String).filter(Boolean),
  stores: fd.getAll("stores").map(String).filter(Boolean),
  roles: fd.getAll("roles").map(String).filter(Boolean),
  managersOnly: fd.get("managersOnly") === "on",
});

/** 選んだ条件で、何人に届くか（LINE未連携の人は名前を出す） */
export async function previewSegment(fd: FormData): Promise<Preview> {
  await requireAdmin();
  const people = await resolveSegment(segmentOf(fd));
  return { total: people.length, linked: people.filter((p) => p.lineUserId).length, unlinked: people.filter((p) => !p.lineUserId).map((p) => p.name) };
}

export async function sendBroadcast(_prev: SendState, fd: FormData): Promise<SendState> {
  const me = await requireAdmin();
  const text = String(fd.get("text") ?? "").trim();
  // 「自分にだけテスト送信」：見え方の確認用。送った記録にも残る
  if (fd.get("test") === "1") {
    if (!text) return { error: "本文を入れてください", at: Date.now() };
    const people = await resolveSegment({ staffIds: [me.id] });
    if (!people[0]?.lineUserId) return { error: "あなたのLINEが連携されていません", at: Date.now() };
    const r = await sendLine({ kind: "manual", text: `［テスト］\n${text}`, recipients: [{ staffId: me.id, lineUserId: people[0].lineUserId }], segment: { test: true }, createdBy: me.id });
    revalidatePath("/admin/line");
    return r.sent ? { ok: "あなたのLINEにテストで送りました", at: Date.now() } : { error: `送れませんでした（${r.skipped ?? "LINEの返事を確認してください"}）`, at: Date.now() };
  }
  if (!text) return { error: "本文を入れてください", at: Date.now() };
  if (text.length > 2000) return { error: "本文は2000文字までにしてください", at: Date.now() };
  const segment = segmentOf(fd);
  const people = await resolveSegment(segment);
  if (!people.some((p) => p.lineUserId)) return { error: "LINE連携済みの人がいません", at: Date.now() };
  const r = await sendLine({ kind: "manual", text, recipients: people.map((p) => ({ staffId: p.id, lineUserId: p.lineUserId })), segment, createdBy: me.id });
  await audit({ actor: me.id, action: "create", targetType: "line_message", targetId: r.messageId ?? null, detail: { recipients: people.length, sent: r.sent } });
  revalidatePath("/admin/line");
  if (r.skipped) return { error: `送れませんでした（${r.skipped}）`, at: Date.now() };
  return { ok: `${r.sent}人に送りました`, at: Date.now() };
}
