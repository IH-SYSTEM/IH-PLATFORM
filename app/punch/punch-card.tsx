// 打刻のスマホ画面の共通の枠
export function PunchCard({
  store,
  title,
  body,
  tone = "info",
  children,
}: {
  store?: string;
  title: string;
  body?: string;
  tone?: "info" | "error" | "success";
  children?: React.ReactNode;
}) {
  const color = tone === "error" ? "text-accent" : tone === "success" ? "text-emerald-700" : "text-brand";
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm rounded-md border border-line bg-white p-6 text-center">
        <p className="text-xs tracking-widest text-slate-400">IKKOU HOLDINGS 打刻</p>
        {store && <p className="mt-3 text-sm text-slate-500">{store}</p>}
        <h1 className={`mt-2 text-xl font-bold ${color}`}>{title}</h1>
        {body && <p className="mt-4 text-sm leading-relaxed text-slate-600">{body}</p>}
        {children}
      </div>
    </main>
  );
}
