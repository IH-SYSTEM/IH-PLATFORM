"use client";

import { startTransition, useActionState, useState } from "react";
import { ROLE_LABELS } from "@/lib/format";
import { AGE_GROUPS, ALLOWANCES, DEDUCTIONS, EMPLOYMENT_TYPES, PERMISSIONS, ageGroupFor, type StaffRecord } from "@/lib/staff";
import { Toast } from "@/app/toast";
import type { SaveState } from "./actions";

type Props = {
  staff: StaffRecord | null;
  stores: { id: string; name: string }[];
  action: (prev: SaveState, fd: FormData) => Promise<SaveState>;
  isSelf: boolean;
  canGrantSuperadmin: boolean;
  createdNotice: boolean;
};

const input =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 disabled:text-slate-500";

function Field({ label, required, children, className = "" }: { label: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-xs font-medium text-slate-600">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function Money({ name, label, value, hidden }: { name: string; label: string; value?: number; hidden?: boolean }) {
  return (
    <Field label={label} className={hidden ? "hidden" : ""}>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">¥</span>
        <input name={name} inputMode="decimal" defaultValue={value ?? 0} className={`${input} pl-7 text-right tabular-nums`} />
      </div>
    </Field>
  );
}

export function StaffForm({ staff, stores, action, isSelf, canGrantSuperadmin, createdNotice }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const pm = staff?.payroll_master ?? {};
  const [employmentType, setEmploymentType] = useState(pm.employmentType ?? "");
  const [retired, setRetired] = useState(staff?.retired ?? false);
  const [birthdate, setBirthdate] = useState(staff?.birthdate ?? "");
  const [showMynumber, setShowMynumber] = useState(false);
  const isSuperadmin = staff?.permission === "superadmin";

  return (
    <form
      onSubmit={(e) => {
        // action 属性を使うと送信後に入力がリセットされ、エラー時に入力内容が消えるため手動で送る
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
      className="space-y-5 pb-24"
    >
      <Section title="基本情報">
        <Field label="氏名" required>
          <input name="name" defaultValue={staff?.name ?? ""} required className={input} />
        </Field>
        <Field label="ふりがな">
          <input name="furigana" defaultValue={staff?.furigana ?? ""} className={input} />
        </Field>
        <Field label="メールアドレス（ログインID）" required>
          <input name="email" type="email" defaultValue={staff?.email ?? ""} required className={input} />
        </Field>
        <Field label="社員番号">
          <input name="employee_no" defaultValue={staff?.employee_no ?? ""} className={input} />
        </Field>
        <Field label="生年月日">
          <input name="birthdate" type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} className={input} />
        </Field>
        <Field label="性別">
          <select name="gender" defaultValue={staff?.gender ?? ""} className={input}>
            <option value="">未設定</option>
            <option value="male">男性</option>
            <option value="female">女性</option>
            <option value="other">その他</option>
          </select>
        </Field>
      </Section>

      <Section title="所属・雇用・権限">
        <Field label="所属店舗">
          <select name="store_id" defaultValue={staff?.store_id ?? ""} className={input}>
            <option value="">未所属</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="雇用区分">
          <select name="role" defaultValue={staff?.role ?? ""} className={input}>
            <option value="">未設定</option>
            {Object.entries(ROLE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="入社日">
          <input name="hire_date" type="date" defaultValue={staff?.hire_date ?? ""} className={input} />
        </Field>
        <Field label="システム権限">
          <select name="permission" defaultValue={staff?.permission ?? "member"} disabled={isSelf || (isSuperadmin && !canGrantSuperadmin)} className={input}>
            {PERMISSIONS.filter((p) => p.value !== "superadmin" || canGrantSuperadmin || isSuperadmin).map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          {isSelf && <span className="text-xs text-slate-400">自分の権限は変更できません</span>}
          {(isSelf || (isSuperadmin && !canGrantSuperadmin)) && <input type="hidden" name="permission" value={staff?.permission ?? "member"} />}
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
          <input type="checkbox" name="line_added" defaultChecked={staff?.line_added ?? false} className="size-4 rounded border-slate-300" />
          公式LINE 登録済み
        </label>
      </Section>

      <Section title="連絡先">
        <Field label="電話番号">
          <input name="phone" type="tel" defaultValue={staff?.phone ?? ""} className={input} />
        </Field>
        <Field label="郵便番号">
          <input name="zipcode" defaultValue={staff?.zipcode ?? ""} className={input} />
        </Field>
        <Field label="緊急連絡先">
          <input name="emergency" defaultValue={staff?.emergency ?? ""} className={input} />
        </Field>
        <Field label="住所" className="sm:col-span-2 lg:col-span-3">
          <input name="address" defaultValue={staff?.address ?? ""} className={input} />
        </Field>
      </Section>

      <Section title="給与マスタ" note="給与入力のときの初期値になります">
        <Field label="給与形態">
          <select name="pm.employmentType" value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} className={input}>
            <option value="">未設定</option>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Money name="pm.baseSalary" label="月給" value={pm.baseSalary} hidden={employmentType !== "monthly"} />
        <Money name="pm.dailyWage" label="日給" value={pm.dailyWage} hidden={employmentType !== "daily"} />
        <Money name="pm.hourlyWage" label="時給" value={pm.hourlyWage} hidden={employmentType !== "hourly"} />
        <Money name="pm.contractAmount" label="業務委託額（月額）" value={pm.contractAmount} hidden={employmentType !== "contract"} />
        <Field label="所定労働日数（月）">
          <input name="pm.workingDays" inputMode="numeric" defaultValue={pm.workingDays ?? 22} className={input} />
        </Field>
        <Field label="年間労働日数">
          <input name="pm.annualWorkingDays" inputMode="numeric" defaultValue={pm.annualWorkingDays ?? 240} className={input} />
        </Field>

        <div className={`sm:col-span-2 lg:col-span-3 ${employmentType === "contract" ? "hidden" : ""}`}>
          <p className="mb-2 text-xs font-semibold text-slate-500">手当（月額）</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ALLOWANCES.map((a) => (
              <Money key={a.key} name={`pm.allowances.${a.key}`} label={a.label} value={pm.allowances?.[a.key]} />
            ))}
          </div>
        </div>

        <div className={`sm:col-span-2 lg:col-span-3 ${employmentType === "contract" ? "hidden" : ""}`}>
          <p className="mb-2 text-xs font-semibold text-slate-500">社会保険・税</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="pm.socialInsurance.enrolled"
                defaultChecked={pm.socialInsurance?.enrolled ?? false}
                className="size-4 rounded border-slate-300"
              />
              社会保険に加入
            </label>
            <Field label="年齢区分（生年月日から自動）">
              <input value={AGE_GROUPS.find((g) => g.value === ageGroupFor(birthdate || null))?.label} disabled className={input} />
            </Field>
            <Field label="源泉徴収税額表">
              <select name="pm.incomeTaxColumn" defaultValue={pm.incomeTaxColumn ?? "甲"} className={input}>
                <option value="甲">甲欄</option>
                <option value="乙">乙欄</option>
              </select>
            </Field>
            <Field label="扶養人数">
              <input name="pm.dependentCount" inputMode="numeric" defaultValue={pm.dependentCount ?? 0} className={input} />
            </Field>
          </div>
        </div>

        <div className={`sm:col-span-2 lg:col-span-3 ${employmentType === "contract" ? "hidden" : ""}`}>
          <p className="mb-2 text-xs font-semibold text-slate-500">毎月の控除</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {DEDUCTIONS.map((d) => (
              <Money key={d.key} name={`pm.${d.key}`} label={d.label} value={pm[d.key] as number | undefined} />
            ))}
          </div>
        </div>
      </Section>

      <Section title="振込口座">
        <Field label="銀行名">
          <input name="bank_name" defaultValue={staff?.bank_name ?? ""} className={input} />
        </Field>
        <Field label="支店名">
          <input name="bank_branch" defaultValue={staff?.bank_branch ?? ""} className={input} />
        </Field>
        <Field label="口座種別">
          <select name="bank_type" defaultValue={staff?.bank_type ?? ""} className={input}>
            <option value="">未設定</option>
            <option value="普通">普通</option>
            <option value="当座">当座</option>
          </select>
        </Field>
        <Field label="口座番号">
          <input name="bank_number" inputMode="numeric" defaultValue={staff?.bank_number ?? ""} className={input} />
        </Field>
        <Field label="口座名義（カナ）">
          <input name="bank_holder" defaultValue={staff?.bank_holder ?? ""} className={input} />
        </Field>
      </Section>

      <Section title="マイナンバー・社会保険番号" note="取り扱いに注意してください">
        <Field label="マイナンバー（12桁）">
          <div className="flex gap-2">
            <input
              name="mynumber"
              type={showMynumber ? "text" : "password"}
              inputMode="numeric"
              autoComplete="off"
              defaultValue={staff?.mynumber ?? ""}
              className={input}
            />
            <button
              type="button"
              onClick={() => setShowMynumber((v) => !v)}
              className="shrink-0 rounded-lg border border-slate-300 px-3 text-xs text-slate-600 hover:bg-slate-50"
            >
              {showMynumber ? "隠す" : "表示"}
            </button>
          </div>
        </Field>
        <Field label="健康保険 被保険者番号">
          <input name="health_insurance_no" defaultValue={staff?.health_insurance_no ?? ""} className={input} />
        </Field>
        <Field label="雇用保険 被保険者番号">
          <input name="employment_insurance_no" defaultValue={staff?.employment_insurance_no ?? ""} className={input} />
        </Field>
        <Field label="基礎年金番号">
          <input name="basic_pension_no" defaultValue={staff?.basic_pension_no ?? ""} className={input} />
        </Field>
        <Field label="厚生年金 整理番号">
          <input name="welfare_pension_no" defaultValue={staff?.welfare_pension_no ?? ""} className={input} />
        </Field>
      </Section>

      <Section title="備考・退職">
        <Field label="備考" className="sm:col-span-2 lg:col-span-3">
          <textarea name="note" rows={3} defaultValue={staff?.note ?? ""} className={input} />
        </Field>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            name="retired"
            checked={retired}
            onChange={(e) => setRetired(e.target.checked)}
            className="size-4 rounded border-slate-300"
          />
          退職済み（ログインできなくなります）
        </label>
        <Field label="退職日" className={retired ? "" : "hidden"}>
          <input name="retirement_date" type="date" defaultValue={staff?.retirement_date ?? ""} className={input} />
        </Field>
        <Field label="退職理由" className={retired ? "" : "hidden"}>
          <input name="retirement_reason" defaultValue={staff?.retirement_reason ?? ""} className={input} />
        </Field>
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur lg:left-60">
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-3 px-4 py-3">
          {state?.error && <p className="mr-auto text-sm font-medium text-rose-600">{state.error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
          >
            {pending ? "保存中…" : staff ? "保存する" : "登録する"}
          </button>
        </div>
      </div>

      {state?.ok && <Toast key={state.at} message="保存しました" />}
      {state?.error && <Toast key={state.at} message={state.error} tone="error" />}
      {createdNotice && !state && <Toast message="スタッフを登録しました" />}
    </form>
  );
}
