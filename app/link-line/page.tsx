import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { LINE_ERRORS, lineConfig, lineFriendUrl } from "@/lib/line-login";
import { logout } from "@/app/login/actions";
import { LineMark } from "@/app/line-mark";

export const metadata = { title: "LINE連携" };

// LINE連携と公式LINEの友だち追加が済むまで、ほかのページには進めない（例外なく全員。2026-10-08 黒田さん決定）
//   1. LINEと連携する
//   2. 公式LINE「IKKOU HOLDINGS NEWS」を友だち追加する（連携・ログインのたびに友だちかを確かめている）
export default async function LinkLinePage({ searchParams }: PageProps<"/link-line">) {
  const me = await requireStaff({ allowUnlinked: true });
  if (!lineConfig() || (me.lineLinked && me.lineFriend === true)) redirect("/");
  const { error } = await searchParams;
  const message = typeof error === "string" ? LINE_ERRORS[error] ?? "LINE連携に失敗しました。もう一度お試しください" : null;
  const step = me.lineLinked ? 2 : 1;
  const friendUrl = lineFriendUrl();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-brand/90 px-4 py-10">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <ol className="flex gap-2 text-xs font-bold">
          <li className={`flex-1 rounded-full py-1 text-center ${step === 1 ? "bg-brand text-white" : "bg-emerald-50 text-emerald-700"}`}>{step === 1 ? "1 LINE連携" : "✓ LINE連携"}</li>
          <li className={`flex-1 rounded-full py-1 text-center ${step === 2 ? "bg-brand text-white" : "bg-slate-100 text-slate-400"}`}>2 友だち追加</li>
        </ol>

        {step === 1 ? (
          <>
            <h1 className="mt-4 text-xl font-bold text-brand">LINEと連携してください</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              {me.name}さん、IKKOU HOLDINGS ポータルでは、LINEを使って次のことを行います。連携が済むまで、ほかの画面には進めません。
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
              <li>・店舗のQRでの出勤・退勤（本人確認）</li>
              <li>・シフトの締切や、報告の結果のお知らせ</li>
              <li>・次回からパスワードなしでログイン</li>
            </ul>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-xl font-bold text-brand">公式LINEを友だち追加してください</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              シフトの締切、報告の結果、給与明細のお知らせは、公式LINE「IKKOU HOLDINGS NEWS」から届きます。友だち追加（ブロックしている場合はブロック解除）をしてから、下の「追加しました」を押してください。
            </p>
            {friendUrl && (
              <a href={friendUrl} target="_blank" rel="noreferrer" className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-[#06c755] px-4 py-3.5 text-base font-bold text-white hover:bg-[#05b34c]">
                <LineMark />
                IKKOU HOLDINGS NEWS を友だち追加
              </a>
            )}
          </>
        )}

        {message && <p className="mt-4 border-l-4 border-accent bg-accent-soft px-3 py-2 text-sm text-accent">{message}</p>}

        <a
          href="/api/auth/line-redirect?mode=link"
          className={`mt-3 flex w-full items-center justify-center gap-2 rounded-md px-4 py-3.5 text-base font-bold ${
            step === 1 ? "bg-[#06c755] text-white hover:bg-[#05b34c]" : "border border-slate-300 text-slate-700 hover:border-brand"
          }`}
        >
          {step === 1 ? (
            <>
              <LineMark />
              LINEと連携する
            </>
          ) : (
            "追加しました（確認する）"
          )}
        </a>
        <p className="mt-4 text-xs text-slate-400">うまくいかない場合は、本部（総務）に連絡してください。</p>
        <form action={logout} className="mt-2 text-right">
          <button className="text-xs text-slate-400 underline hover:text-slate-600">ログアウト</button>
        </form>
      </div>
    </main>
  );
}
