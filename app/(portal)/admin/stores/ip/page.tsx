import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "この端末のIPアドレス" };
export const dynamic = "force-dynamic";

/** 店の Wi-Fi のIPアドレス（インターネット側）を調べる。店の Wi-Fi につないだスマホ・iPad でこのページを開く */
export default async function MyIpPage() {
  await requireAdmin();
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "（分かりませんでした）";
  const v6 = ip.includes(":");
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-bold text-slate-900">この端末のIPアドレス</h1>
      <p className="rounded-md border border-line bg-white p-6 text-center font-mono text-2xl font-bold tabular-nums text-slate-900">{ip}</p>
      {v6 && <p className="text-xs text-amber-700">IPv6 の番号です。光回線によっては変わることがあります。何日かあけてもう一度調べ、変わっていれば両方入れてください</p>}
      <ul className="space-y-1 text-sm text-slate-600">
        <li>・店の Wi-Fi につないだ状態で開いてください（モバイル通信のままだと、携帯会社の番号が出ます）</li>
        <li>・出た番号を「店舗・部署マスタ › その店 › WiFi打刻の許可IPアドレス」に入れます</li>
        <li>・ルーターを再起動したり、回線の契約を変えたりすると番号が変わることがあります</li>
      </ul>
    </div>
  );
}
