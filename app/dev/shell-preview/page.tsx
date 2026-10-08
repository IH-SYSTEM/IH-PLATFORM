import { notFound } from "next/navigation";
import type { CurrentStaff } from "@/lib/auth";
import { AppShell } from "@/app/shell/app-shell";
import { PageHeader } from "@/app/shell/page-header";

// 開発中だけ使う、画面の枠の見た目の確認用（本番では 404。本番ではログインも必要）
export default async function ShellPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  const fake: CurrentStaff = { id: "preview", name: "黒田　学", email: null, role: "officer", permission: "superadmin", isAdmin: true, lineLinked: true, lineFriend: true, mustSetPassword: false };
  return (
    <AppShell staff={fake}>
      <PageHeader title="スタッフ管理" description="登録・編集・給与マスタの設定" actions={<button className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white">＋ スタッフを登録</button>} />
      <div className="overflow-hidden rounded-md border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">氏名</th>
              <th className="px-4 py-3 font-medium">所属</th>
              <th className="px-4 py-3 font-medium">雇用区分</th>
              <th className="px-4 py-3 font-medium">権限</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {[["荒川 揚介", "郷彩 根っこ", "業務委託", "一般スタッフ"], ["井上 利光", "COOKIE熊本", "正社員", "一般スタッフ"], ["植屋 真聡", "IKKOU HOLDINGS", "管理部", "管理者"]].map((r) => (
              <tr key={r[0]}>
                {r.map((c) => (
                  <td key={c} className="px-4 py-3">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
