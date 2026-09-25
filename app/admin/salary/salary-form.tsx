"use client";

import Link from "next/link";
import { startTransition, useActionState, useMemo, useState } from "react";
import { Toast } from "@/app/toast";
import { yen } from "@/lib/format";
import { EMPLOYMENT_TYPES } from "@/lib/staff";
import { calculatePayroll, type Master } from "@/lib/payroll/calculator";
import { TABLE_VERSION } from "@/lib/payroll/tables";
import {
  ALLOWANCE_FIELDS,
  ATTENDANCE_FIELDS,
  DEDUCTION_FIELDS,
  PAYMENT_BASE_FIELDS,
  basePay,
  totals,
  type EmploymentType,
  type SalaryValues,
} from "@/lib/payroll/record";
import type { SalarySaveState } from "./actions";

type Group = "attendance" | "payment" | "deduction";
type Draft = Record<Group, Record<string, string>>;

export type ExistingRecord = {
  employment_type: EmploymentType;
  attendance: Record<string, number>;
  payment: Record<string, number>;
  deduction: Record<string, number>;
  memo: string | null;
  status: "draft" | "confirmed";
};

const toStrings = (o: Record<string, number | undefined>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === undefined || v === null ? "" : String(v)]));
const toNumbers = (o: Record<string, string>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number(String(v).replace(/[,，\s]/g, "")) || 0]));

function initialDraft(record: ExistingRecord | null, master: Master | null): Draft {
  if (record) return { attendance: toStrings(record.attendance), payment: toStrings(record.payment), deduction: toStrings(record.deduction) };
  const m = master ?? {};
  const payment: Record<string, number | undefined> = {
    baseSalary: m.baseSalary,
    dailyWage: m.dailyWage,
    contractAmount: m.contractAmount,
  };
  for (const f of ALLOWANCE_FIELDS) payment[f.key] = m.allowances?.[f.master];
  return {
    attendance: toStrings({ hourlyWage: m.hourlyWage }),
    payment: toStrings(payment),
    deduction: toStrings({
      residentTax: m.residentTaxMonthly,
      savings: m.savingsDeduction,
      repayment: m.repaymentDeduction,
      childSupport: m.childSupportDeduction,
      otherDeduction: m.otherDeduction,
    }),
  };
}

const numInput =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-sm tabular-nums text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20";

function NumField({ label, unit, value, onChange }: { label: string; unit?: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <div className="relative">
        {!unit && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">¥</span>}
        <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" className={`${numInput} ${unit ? "pr-9" : "pl-7"}`} />
        {unit && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">{unit}</span>}
      </div>
    </label>
  );
}

function Card({ title, children, footer }: { title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
      {footer}
    </section>
  );
}

export function SalaryForm({
  staffId,
  master,
  incomeTaxColumn,
  record,
  action,
}: {
  staffId: string;
  master: Master | null;
  incomeTaxColumn: string | null;
  record: ExistingRecord | null;
  action: (prev: SalarySaveState, fd: FormData) => Promise<SalarySaveState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [type, setType] = useState<EmploymentType | "">(record?.employment_type ?? (master?.employmentType as EmploymentType) ?? "");
  const [draft, setDraft] = useState<Draft>(() => initialDraft(record, master));
  const [memo, setMemo] = useState(record?.memo ?? "");
  const [calcNote, setCalcNote] = useState<string | null>(null);
  const savedStatus = state?.ok ? state.status : record?.status;

  const set = (group: Group, key: string) => (v: string) => setDraft((d) => ({ ...d, [group]: { ...d[group], [key]: v } }));
  const get = (group: Group, key: string) => draft[group][key] ?? "";

  const values: SalaryValues | null = useMemo(
    () =>
      type
        ? { employmentType: type, attendance: toNumbers(draft.attendance), payment: toNumbers(draft.payment), deduction: toNumbers(draft.deduction) }
        : null,
    [type, draft],
  );
  const t = values ? totals(values) : null;

  const masterUnit = master
    ? { monthly: master.baseSalary, daily: master.dailyWage, hourly: master.hourlyWage, contract: master.contractAmount }[
        master.employmentType as EmploymentType
      ]
    : undefined;

  function autoCalculate() {
    if (!master?.employmentType || !values) return;
    const hasAmounts = t !== null && (t.totalPayment !== 0 || t.totalDeduction !== 0);
    if (hasAmounts && !window.confirm("入力済みの支給・控除を、給与マスタから計算した値で上書きします。よろしいですか？")) return;
    const a = values.attendance;
    const r = calculatePayroll(master, {
      workDays: a.workDays || 0,
      absenceDays: a.absenceDays || 0,
      workHours: a.workHours || 0,
      hourlyWage: a.hourlyWage || 0,
    });
    setDraft((d) => {
      const payment = { ...d.payment };
      const attendance = { ...d.attendance };
      if (master.employmentType === "monthly") payment.baseSalary = String(r.base);
      if (master.employmentType === "daily") payment.dailyWage = String(master.dailyWage ?? 0);
      if (master.employmentType === "hourly") attendance.hourlyWage = String(master.hourlyWage ?? 0);
      if (master.employmentType === "contract") payment.contractAmount = String(r.base);
      for (const f of ALLOWANCE_FIELDS) payment[f.key] = String(r.allowances[f.master]);
      const deduction =
        master.employmentType === "contract"
          ? d.deduction
          : toStrings({
              healthInsurance: r.healthInsurance,
              careInsurance: r.careInsurance,
              pension: r.pension,
              employmentInsurance: r.employmentInsurance,
              childSupport: r.childSupport,
              incomeTax: r.incomeTax,
              residentTax: r.residentTax,
              savings: r.savings,
              repayment: r.repayment,
              otherDeduction: r.otherDeduction,
            });
      return { attendance, payment, deduction };
    });
    setType(master.employmentType as EmploymentType);
    setCalcNote(
      r.grade
        ? `標準報酬月額 ${yen(r.standardMonthly)}（${r.grade}等級）で社会保険料を計算しました`
        : "社会保険は未加入のため、保険料は0円で計算しました",
    );
  }

  function submit(status: "draft" | "confirmed") {
    if (!values) return;
    if (status === "confirmed" && !window.confirm("確定すると、スタッフのマイページに給与明細が表示されます。確定しますか？")) return;
    const fd = new FormData();
    fd.set("status", status);
    fd.set("values", JSON.stringify(values));
    fd.set("memo", memo);
    startTransition(() => formAction(fd));
  }

  const baseField = type ? PAYMENT_BASE_FIELDS[type] : null;

  return (
    <div className="grid gap-5 pb-28 lg:grid-cols-3 lg:pb-0">
      <div className="space-y-5 lg:col-span-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-4">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600">給与形態</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as EmploymentType)}
                className="block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">選択してください</option>
                {EMPLOYMENT_TYPES.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={autoCalculate}
              disabled={!master?.employmentType || !type}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              マスタから自動計算
            </button>
            <span className="text-xs text-slate-400">料率・税額表：{TABLE_VERSION}</span>
          </div>
          {!master?.employmentType && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
              給与マスタが未登録のため、自動計算は使えません。
              <Link href={`/admin/staff/${staffId}`} className="ml-1 font-semibold underline">
                スタッフ管理で登録する
              </Link>
            </p>
          )}
          {master?.employmentType && !masterUnit && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
              給与マスタの{EMPLOYMENT_TYPES.find((e) => e.value === master.employmentType)?.label}が0円です。自動計算すると支給額が0円になります。
              <Link href={`/admin/staff/${staffId}`} className="ml-1 font-semibold underline">
                給与マスタを確認する
              </Link>
            </p>
          )}
          {incomeTaxColumn === "乙" && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
              源泉徴収税額表が「乙欄」のスタッフです。自動計算は甲欄で計算するため、所得税は手入力で確認してください。
            </p>
          )}
          {calcNote && <p className="mt-3 text-sm text-indigo-700">{calcNote}</p>}
        </section>

        {type && (
          <>
            <Card title="勤怠">
              {ATTENDANCE_FIELDS.map((f) => (
                <NumField key={f.key} label={f.label} unit={f.unit} value={get("attendance", f.key)} onChange={set("attendance", f.key)} />
              ))}
              {type === "hourly" && (
                <>
                  <NumField label="時給" value={get("attendance", "hourlyWage")} onChange={set("attendance", "hourlyWage")} />
                  <NumField label="勤務時間" unit="時間" value={get("attendance", "workHours")} onChange={set("attendance", "workHours")} />
                </>
              )}
            </Card>

            <Card
              title="支給"
              footer={
                values && (
                  <p className="mt-4 text-right text-xs text-slate-500">
                    基本給分 {yen(basePay(values))}
                    {type === "daily" && "（日給 × 出勤日数）"}
                    {type === "hourly" && "（時給 × 勤務時間、1円未満は四捨五入）"}
                  </p>
                )
              }
            >
              {baseField && <NumField label={baseField.label} value={get("payment", baseField.key)} onChange={set("payment", baseField.key)} />}
              {type !== "contract" &&
                ALLOWANCE_FIELDS.map((f) => <NumField key={f.key} label={f.label} value={get("payment", f.key)} onChange={set("payment", f.key)} />)}
            </Card>

            {type !== "contract" && (
              <Card title="控除">
                {DEDUCTION_FIELDS.map((f) => (
                  <NumField key={f.key} label={f.label} value={get("deduction", f.key)} onChange={set("deduction", f.key)} />
                ))}
              </Card>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800">備考</h2>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={3}
                className="mt-3 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
            </section>
          </>
        )}
      </div>

      <aside className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white p-4 shadow-lg lg:sticky lg:inset-auto lg:top-6 lg:self-start lg:rounded-2xl lg:border lg:p-5 lg:shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">集計</h2>
          {savedStatus === "confirmed" ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">確定済み</span>
          ) : savedStatus === "draft" ? (
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">下書き</span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">未保存</span>
          )}
        </div>
        <dl className="mt-3 hidden space-y-2 text-sm lg:block">
          <div className="flex justify-between">
            <dt className="text-slate-500">総支給額</dt>
            <dd className="tabular-nums">{t ? yen(t.totalPayment) : "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">控除合計</dt>
            <dd className="tabular-nums">{t ? yen(t.totalDeduction) : "—"}</dd>
          </div>
        </dl>
        <div className="mt-2 flex items-end justify-between border-slate-100 lg:mt-3 lg:block lg:border-t lg:pt-3">
          <p className="text-xs text-slate-500">差引支給額</p>
          <p className="text-2xl font-bold tabular-nums text-slate-900 lg:mt-1 lg:text-3xl">{t ? yen(t.netPayment) : "—"}</p>
        </div>
        {state?.error && <p className="mt-3 text-sm font-medium text-rose-600">{state.error}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2 lg:mt-5 lg:grid-cols-1">
          <button
            type="button"
            disabled={!values || pending}
            onClick={() => submit("draft")}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            下書き保存
          </button>
          <button
            type="button"
            disabled={!values || pending}
            onClick={() => submit("confirmed")}
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending ? "保存中…" : "確定する"}
          </button>
        </div>
      </aside>

      {state?.ok && <Toast key={state.at} message={state.status === "confirmed" ? "確定しました" : "下書き保存しました"} />}
      {state?.error && <Toast key={state.at} message={state.error} tone="error" />}
    </div>
  );
}
