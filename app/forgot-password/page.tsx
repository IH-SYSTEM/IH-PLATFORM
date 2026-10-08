import Image from "next/image";
import Link from "next/link";

export const metadata = { title: "パスワードを忘れた方" };

// メールでの再設定はしない（届かないことがあるため）。LINEでログインするか、本部に仮パスワードを出してもらう
export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-start justify-center bg-white px-6 pb-12 pt-14 sm:items-center sm:py-12">
      <div className="w-full max-w-sm">
        <Image src="/brand/logo.png" alt="IKKOU HOLDINGS" unoptimized width={140} height={35} priority />
        <h1 className="mt-8 text-xl font-bold text-brand">パスワードを忘れた方</h1>
        <ol className="mt-6 space-y-4 text-sm leading-relaxed text-slate-700">
          <li className="rounded-md border border-line p-4">
            <p className="font-bold text-slate-900">LINEと連携している方</p>
            <p className="mt-1">ログイン画面の「LINEでログイン」から入れます。入ったあと、アカウントの画面でパスワードを変えられます。</p>
            <a href="/api/auth/line-redirect?mode=login" className="mt-3 block rounded-md bg-[#06C755] px-4 py-2.5 text-center font-bold text-white">
              LINEでログイン
            </a>
          </li>
          <li className="rounded-md border border-line p-4">
            <p className="font-bold text-slate-900">LINEと連携していない方</p>
            <p className="mt-1">店長か本部に「仮パスワードに戻してください」と伝えてください。仮パスワードでログインしたら、自分のパスワードに変えます。</p>
          </li>
        </ol>
        <Link href="/login" className="mt-6 inline-block text-sm text-slate-500 hover:text-brand">
          ← ログイン画面に戻る
        </Link>
      </div>
    </main>
  );
}
