import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { allAccountTitles } from "@/lib/account-titles";
import { hasDuty } from "@/lib/duties";
import { addAccountTitle, updateAccountTitle } from "./actions";
import { AddTitleForm, TitleRow } from "./forms";

export const metadata = { title: "勘定科目" };

/** 勘定科目マスタ（経理の担当と代表）。経費・請求書で選ぶ勘定科目と、AI が振り分けるときの目安 */
export default async function AccountTitlesPage() {
  const me = await requireAdmin();
  if (!hasDuty(me, "keiri_input", "keiri_approve")) redirect("/admin");
  const titles = await allAccountTitles();
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">勘定科目</h1>
        <p className="mt-1 text-sm text-slate-500">
          経費・請求書で選ぶ勘定科目です。名前は<b>マネーフォワードの勘定科目と同じ</b>にしてください（違うと CSV の取り込みで止まります）。「AI への目安」に書いた内容で、AI が振り分けます。名前は、過去の経費と合わなくなるので変えられません。使わなくなったら「使う」を外します
        </p>
      </div>
      <AddTitleForm action={addAccountTitle} />
      <div className="divide-y divide-slate-100 overflow-hidden rounded-md border border-line bg-white">
        {titles.map((t) => (
          <TitleRow key={t.name} t={t} action={updateAccountTitle.bind(null, t.name)} />
        ))}
      </div>
    </div>
  );
}
