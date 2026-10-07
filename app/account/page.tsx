import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { jpDate } from "@/lib/format";
import { LINE_ERRORS, lineConfig } from "@/lib/line-login";
import { PortalHeader } from "@/app/portal-header";
import { MobileTabBar } from "@/app/mobile-tab-bar";
import { Toast } from "@/app/toast";
import { unlinkLine } from "./actions";
import { LineMark } from "@/app/line-mark";

export const metadata = { title: "アカウント" };

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const me = await requireStaff({ allowUnlinked: true });
  const { line, error } = await searchParams;
  const supabase = await createClient();
  const { data: profile } = await supabase.from("staff").select("email, line_user_id, line_connected_at").eq("id", me.id).single();
  const linked = Boolean(profile?.line_user_id);
  const lineReady = Boolean(lineConfig());
  const errorMessage = typeof error === "string" ? LINE_ERRORS[error] : undefined;

  return (
    <div className="min-h-screen">
      <PortalHeader staff={me} />
      <main className="mx-auto max-w-2xl space-y-6 px-4 pb-28 pt-5 lg:pb-16">
        <Link href="/" className="inline-block text-sm text-slate-500 hover:text-brand">
          ← ポータル
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-bold text-brand">
          <span className="h-5 w-1 bg-accent" />
          アカウント
        </h1>

        {errorMessage && <p className="border-l-4 border-accent bg-accent-soft px-4 py-3 text-sm text-accent">{errorMessage}</p>}

        <section className="rounded-md border border-line bg-white p-5">
          <h2 className="text-sm font-bold text-slate-900">ログイン情報</h2>
          <dl className="mt-3 text-sm">
            <dt className="text-xs text-slate-500">メールアドレス（ログインID）</dt>
            <dd className="mt-0.5 break-all font-medium text-slate-900">{profile?.email}</dd>
          </dl>
          <Link
            href="/account/password"
            className="mt-4 flex items-center justify-between rounded-md border border-line px-4 py-3 text-sm font-medium text-slate-700 hover:border-brand hover:text-brand"
          >
            パスワードを変更する
            <span aria-hidden>›</span>
          </Link>
        </section>

        <section className="rounded-md border border-line bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-slate-900">LINEでログイン</h2>
            {linked ? (
              <span className="rounded-sm bg-[#06c755]/10 px-2 py-0.5 text-xs font-bold text-[#06a346]">連携済み</span>
            ) : (
              <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">未連携</span>
            )}
          </div>
          {linked ? (
            <>
              <p className="mt-2 text-sm text-slate-600">
                ログイン画面の「LINEでログイン」から、パスワードなしでログインできます。
                {profile?.line_connected_at && <span className="block text-xs text-slate-400">連携日：{jpDate(profile.line_connected_at)}</span>}
              </p>
              <form action={unlinkLine} className="mt-4">
                <button className="text-sm text-slate-500 underline hover:text-accent">LINE連携を解除する</button>
              </form>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-slate-600">一度連携すると、次回からLINEのボタンひとつでログインできます。</p>
              {lineReady ? (
                <a
                  href="/api/auth/line-redirect?mode=link"
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-[#06c755] px-4 py-3 text-base font-bold text-white hover:bg-[#05b34c]"
                >
                  <LineMark />
                  LINEと連携する
                </a>
              ) : (
                <p className="mt-4 rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-500">LINE連携は現在準備中です</p>
              )}
            </>
          )}
        </section>
      </main>
      <MobileTabBar />
      {line === "linked" && <Toast message="LINEと連携しました" />}
      {line === "unlinked" && <Toast message="LINE連携を解除しました" />}
    </div>
  );
}
