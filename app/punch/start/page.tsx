import { openTokenStore } from "@/lib/punch";

export const metadata = { title: "打刻" };

// 打刻QRの読み取り先。いまはQRが有効かどうかだけを確かめる
// TODO: LINE で本人確認 → トークンを claim → 出勤・退勤の確認画面へ（次の段階で作る）
export default async function PunchStartPage({ searchParams }: PageProps<"/punch/start">) {
  const { t } = await searchParams;
  const store = await openTokenStore(typeof t === "string" ? t : "");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-md border border-line bg-white p-6 text-center">
        {store ? (
          <>
            <p className="text-sm text-slate-500">{store.name}</p>
            <h1 className="mt-2 text-xl font-bold text-brand">QRを読み取りました</h1>
            <p className="mt-4 text-sm text-slate-600">打刻の機能は準備中です。今は、今までの方法で打刻してください。</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-brand">このQRは使えません</h1>
            <p className="mt-4 text-sm text-slate-600">
              有効期限が切れたか、すでに使われたQRです。店内の画面に表示されているQRを、もう一度読み取ってください。
            </p>
          </>
        )}
      </div>
    </main>
  );
}
