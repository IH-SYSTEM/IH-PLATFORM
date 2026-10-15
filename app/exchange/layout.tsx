import Image from "next/image";

export const metadata = { title: { default: "資料閲覧", template: "%s | 一鴻グループ 資料閲覧" }, robots: { index: false, follow: false } };

/** 取引先（銀行）用の画面の枠。社内のメニューは出さない */
export default function BankLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Image src="/brand/logo.png" alt="IKKOU HOLDINGS" unoptimized width={112} height={28} priority />
          <span className="text-sm font-bold text-slate-500">資料の受け渡し</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </div>
  );
}
