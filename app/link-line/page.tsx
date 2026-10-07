import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { LINE_ERRORS, lineConfig } from "@/lib/line-login";
import { logout } from "@/app/login/actions";
import { LineMark } from "@/app/line-mark";

export const metadata = { title: "LINE連携" };

// 最初のログインで表示する。LINE連携が済むまで、ほかのページには進めない
export default async function LinkLinePage({ searchParams }: PageProps<"/link-line">) {
  const me = await requireStaff({ allowUnlinked: true });
  if (me.lineLinked || !lineConfig()) redirect("/");
  const { error } = await searchParams;
  const message = typeof error === "string" ? LINE_ERRORS[error] ?? "LINE連携に失敗しました。もう一度お試しください" : null;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-brand/90 px-4 py-10">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <p className="text-xs font-bold tracking-widest text-accent">はじめに</p>
        <h1 className="mt-1 text-xl font-bold text-brand">LINEと連携してください</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          {me.name}さん、IKKOU HOLDINGS ポータルでは、LINEを使って次のことを行います。連携が済むまで、ほかの画面には進めません。
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
          <li>・店舗のQRでの出勤・退勤（本人確認）</li>
          <li>・シフトの締切や、報告の結果のお知らせ</li>
          <li>・次回からパスワードなしでログイン</li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">途中で公式LINE「IKKOU HOLDINGS NEWS」の友だち追加が表示されたら、追加してください。</p>

        {message && <p className="mt-4 border-l-4 border-accent bg-accent-soft px-3 py-2 text-sm text-accent">{message}</p>}

        <a
          href="/api/auth/line-redirect?mode=link"
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-[#06c755] px-4 py-3.5 text-base font-bold text-white hover:bg-[#05b34c]"
        >
          <LineMark />
          LINEと連携する
        </a>
        <p className="mt-4 text-xs text-slate-400">うまく連携できない場合は、本部（総務）に連絡してください。</p>
        <form action={logout} className="mt-2 text-right">
          <button className="text-xs text-slate-400 underline hover:text-slate-600">ログアウト</button>
        </form>
      </div>
    </main>
  );
}
