import Image from "next/image";
import { confirmLink } from "./actions";

export const metadata = { title: "パスワードの再設定" };

// 再設定メールのリンク先。開いただけでは何もせず、ボタンで先へ進む
export default async function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  const { token_hash, type } = await searchParams;
  return (
    <main className="flex min-h-screen items-start justify-center bg-white px-6 pb-12 pt-14 sm:items-center sm:py-12">
      <div className="w-full max-w-sm">
        <Image src="/brand/logo.png" alt="IKKOU HOLDINGS" unoptimized width={140} height={35} priority />
        <h1 className="mt-8 text-xl font-bold text-brand">パスワードの再設定</h1>
        <p className="mt-2 text-sm text-slate-600">下のボタンを押して、新しいパスワードを決めてください。</p>
        <form action={confirmLink} className="mt-6">
          <input type="hidden" name="token_hash" value={typeof token_hash === "string" ? token_hash : ""} />
          <input type="hidden" name="type" value={typeof type === "string" ? type : ""} />
          <button className="w-full rounded-md bg-brand px-4 py-3 text-base font-bold text-white hover:bg-brand-2">新しいパスワードを決める</button>
        </form>
      </div>
    </main>
  );
}
