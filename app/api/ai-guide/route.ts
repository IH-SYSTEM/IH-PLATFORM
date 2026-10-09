import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
import { guideSystem, type GuideLevel } from "@/lib/ai-guide/prompt";
import { attendanceScope } from "@/lib/attendance";
import { SPARRING_SYSTEM, sparringContext } from "@/lib/ai-guide/sparring";
import { ROLE_LABELS } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

type Turn = { role: "user" | "assistant"; content: string };
const client = new Anthropic();

/**
 * AI取説（全員）と壁打ち（最高管理者だけ）。会話は画面側が持ち、毎回まとめて送ってくる。答えは文字のまま流す。
 * 決まった前提（取扱説明書・壁打ちの約束）はキャッシュし、人や日で変わるもの（その人の権限・コンセプト帳・数字）は後ろに置く
 */
export async function POST(request: NextRequest) {
  const me = await getCurrentStaff();
  if (!me) return NextResponse.json({ error: "ログインしてください" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { mode?: string; messages?: Turn[] } | null;
  const mode = body?.mode === "sparring" ? "sparring" : "guide";
  if (mode === "sparring" && me.permission !== "superadmin") return NextResponse.json({ error: "壁打ちは代表だけが使えます" }, { status: 403 });
  const messages = (body?.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  if (!messages.length || messages.at(-1)!.role !== "user") return NextResponse.json({ error: "質問を入れてください" }, { status: 400 });

  let variable: string;
  // 権限：本部＝管理者、店長＝店舗マスタの店長または権限「店長」（勤怠を見られる範囲がある人）、それ以外は一般スタッフ
  const level: GuideLevel = me.isAdmin ? "admin" : (await attendanceScope(me)) ? "manager" : "staff";
  if (mode === "guide") {
    const { data: self } = await createAdminClient().from("staff").select("store_id, stores(name)").eq("id", me.id).single();
    const store = (self?.stores as unknown as { name: string } | null)?.name ?? "未設定";
    variable = `## いま質問している人\n名前：${me.name}／雇用区分：${ROLE_LABELS[me.role ?? ""] ?? "未設定"}／所属：${store}`;
  } else {
    variable = await sparringContext();
  }

  const stream = client.beta.messages.stream({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: mode === "sparring" ? "high" : "low" },
    system: [
      { type: "text", text: mode === "sparring" ? SPARRING_SYSTEM : guideSystem(level), cache_control: { type: "ephemeral" } },
      { type: "text", text: variable },
    ],
    messages,
  });

  const encoder = new TextEncoder();
  const out = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") controller.enqueue(encoder.encode(event.delta.text));
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") controller.enqueue(encoder.encode("\n\n（この質問にはお答えできませんでした。言い方を変えてもう一度聞いてください）"));
        if (final.stop_reason === "max_tokens") controller.enqueue(encoder.encode("\n\n（長くなったので途中で止まりました。「続けて」と送ってください）"));
      } catch (e) {
        console.error("ai-guide", e);
        controller.enqueue(encoder.encode(e instanceof Anthropic.APIError && e.status === 401 ? "\n\n（AIの設定（APIキー）がまだできていません。本部に伝えてください）" : "\n\n（いまAIにつながりませんでした。少し待ってもう一度送ってください）"));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(out, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
