import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { businessDayJST } from "@/lib/business-day";
import { VAULT_CATEGORIES, canUseVault, formatBytes } from "@/lib/files";
import { createAdminClient } from "@/lib/supabase/admin";
import { addPartnerUser, resetPartnerPassword, saveShares, togglePartner, updatePartnerUser } from "../actions";
import { AddUserForm, SharesForm, TogglePartnerButton, UserRowForm } from "../forms";

export const metadata = { title: "取引先（銀行）" };

const ACTIONS: Record<string, string> = { login: "ログイン", login_failed: "ログイン失敗", view_file: "書類を開いた", view_sales: "売上を見た", upload: "書類を送った", logout: "ログアウト" };
const ymd = (d: string) => `${d.slice(0, 4)}/${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** 1つの銀行：担当者の ID、見せるもの、銀行から預かった書類、操作の記録 */
export default async function PartnerPage({ params }: PageProps<"/admin/partners/[id]">) {
  const me = await requireAdmin();
  if (!canUseVault(me)) return <p className="text-sm text-slate-600">取引先（銀行）は、経理・総務の担当だけが扱えます</p>;
  const { id } = await params;
  const admin = createAdminClient();
  const { data: partner } = await admin.from("partners").select("id, name, note, is_active").eq("id", id).maybeSingle();
  if (!partner) notFound();
  const [{ data: users }, { data: shares }, { data: companies }, { data: files }, { data: received }, { data: logs }] = await Promise.all([
    admin.from("partner_users").select("id, name, email, expires_on, is_active, last_login_at, locked_until").eq("partner_id", id).order("created_at"),
    admin.from("partner_shares").select("kind, file_id, company_id").eq("partner_id", id),
    admin.from("companies").select("id, name").eq("is_active", true).order("sort_order"),
    admin.from("files").select("id, name, category, doc_kind, doc_date, owner_company_id").not("owner_company_id", "is", null).eq("status", "ready").order("doc_date", { ascending: false, nullsFirst: false }),
    admin.from("files").select("id, name, note, size_bytes, created_at").eq("owner_partner_id", id).eq("status", "ready").order("created_at", { ascending: false }),
    admin.from("partner_access_logs").select("at, user_id, action, target").eq("partner_id", id).order("at", { ascending: false }).limit(100),
  ]);
  const nameOf = new Map((users ?? []).map((u) => [u.id, u.name]));
  const byCompany: Record<string, { id: string; label: string; sub: string }[]> = {};
  for (const f of files ?? []) {
    const k = f.owner_company_id as string;
    (byCompany[k] ??= []).push({
      id: f.id,
      label: `${f.doc_kind ?? VAULT_CATEGORIES[f.category as keyof typeof VAULT_CATEGORIES]?.label ?? f.category}${f.doc_date ? `（${ymd(f.doc_date)}）` : ""}`,
      sub: f.name,
    });
  }
  const in90 = new Date(Date.parse(`${businessDayJST()}T12:00:00Z`) + 90 * 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href="/admin/partners" className="text-sm text-slate-500 hover:text-slate-800">
            ← 取引先（銀行）
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{partner.name}</h1>
          {partner.note && <p className="text-sm text-slate-500">{partner.note}</p>}
        </div>
        <TogglePartnerButton active={partner.is_active} act={togglePartner.bind(null, id, !partner.is_active)} />
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">担当者の ID</h2>
        <p className="mt-0.5 text-xs text-slate-500">ID はメールアドレス。ログインのたびに、そのメールに確認コードが届きます。入口：portal.ikkou-holdings.co.jp/bank</p>
        <ul className="mt-3 divide-y divide-slate-100">
          {(users ?? []).map((u) => (
            <li key={u.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="text-sm">
                <p className="font-bold text-slate-900">
                  {u.name}
                  {!u.is_active && <span className="ml-2 rounded bg-slate-200 px-1.5 text-xs font-normal text-slate-600">止めています</span>}
                </p>
                <p className="text-slate-600">{u.email}</p>
                <p className="text-xs text-slate-400">最後のログイン：{u.last_login_at ? new Date(u.last_login_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "まだ"}</p>
              </div>
              <UserRowForm user={u} update={updatePartnerUser.bind(null, u.id, id)} reset={resetPartnerPassword.bind(null, u.id, id)} />
            </li>
          ))}
        </ul>
        <div className="mt-3 border-t border-slate-100 pt-3">
          <AddUserForm action={addPartnerUser.bind(null, id)} defaultExpires={in90} />
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">見せるもの</h2>
        <SharesForm
          action={saveShares.bind(null, id)}
          companies={companies ?? []}
          files={byCompany}
          sharedFiles={(shares ?? []).filter((s) => s.kind === "file").map((s) => s.file_id as string)}
          sharedSales={(shares ?? []).filter((s) => s.kind === "sales").map((s) => s.company_id as string)}
        />
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">銀行から預かった書類</h2>
        {!(received ?? []).length && <p className="mt-2 text-sm text-slate-400">まだありません</p>}
        <ul className="mt-2 divide-y divide-slate-100 text-sm">
          {(received ?? []).map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-x-3 py-2">
              <a href={`/files/${f.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-brand hover:underline">
                {f.name}
              </a>
              {f.note && <span className="text-xs text-slate-600">{f.note}</span>}
              <span className="text-xs text-slate-400">
                {formatBytes(f.size_bytes)}・{new Date(f.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">操作の記録（最新100件）</h2>
        {!(logs ?? []).length && <p className="mt-2 text-sm text-slate-400">まだありません</p>}
        <ul className="mt-2 divide-y divide-slate-100 text-sm">
          {(logs ?? []).map((l, i) => (
            <li key={i} className="flex flex-wrap gap-x-3 py-1.5">
              <span className="tabular-nums text-slate-500">{new Date(l.at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</span>
              <span className="text-slate-800">{nameOf.get(l.user_id ?? "") ?? "—"}</span>
              <span className={l.action === "login_failed" ? "font-bold text-accent" : "text-slate-700"}>{ACTIONS[l.action] ?? l.action}</span>
              {l.target && <span className="text-slate-500">{l.target}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
