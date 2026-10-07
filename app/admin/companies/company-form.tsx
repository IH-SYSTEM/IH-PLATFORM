"use client";

import { startTransition, useActionState } from "react";
import { Toast } from "@/app/toast";
import { Check, Field, SaveBar, Section, inputClass as input } from "../form-ui";
import type { CompanySaveState } from "./actions";

export type CompanyRecord = {
  id: string;
  code: string;
  name: string;
  name_kana: string | null;
  corporate_number: string | null;
  representative: string | null;
  zipcode: string | null;
  address: string | null;
  phone: string | null;
  sort_order: number;
  is_active: boolean;
};

export function CompanyForm({ company, action }: { company: CompanyRecord | null; action: (p: CompanySaveState, fd: FormData) => Promise<CompanySaveState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
      className="space-y-5 pb-24"
    >
      <Section title="会社の情報" note="源泉徴収票・法定帳簿・年末調整の書類に載る情報です">
        <Field label="会社名" required>
          <input name="name" defaultValue={company?.name ?? ""} required className={input} />
        </Field>
        <Field label="会社名（ふりがな）">
          <input name="name_kana" defaultValue={company?.name_kana ?? ""} className={input} />
        </Field>
        <Field label="会社コード" required hint="英大文字2〜4文字（例：IE）">
          <input name="code" defaultValue={company?.code ?? ""} maxLength={4} required className={`${input} font-mono uppercase`} />
        </Field>
        <Field label="法人番号" hint="13桁。国税庁の法人番号公表サイトで確認できます">
          <input name="corporate_number" inputMode="numeric" defaultValue={company?.corporate_number ?? ""} className={`${input} font-mono`} />
        </Field>
        <Field label="代表者">
          <input name="representative" defaultValue={company?.representative ?? ""} className={input} />
        </Field>
        <Field label="電話番号">
          <input name="phone" defaultValue={company?.phone ?? ""} className={input} />
        </Field>
        <Field label="郵便番号">
          <input name="zipcode" defaultValue={company?.zipcode ?? ""} className={input} />
        </Field>
        <Field label="所在地" className="sm:col-span-2">
          <input name="address" defaultValue={company?.address ?? ""} className={input} />
        </Field>
        <Field label="表示順">
          <input name="sort_order" inputMode="numeric" defaultValue={company?.sort_order ?? 0} className={input} />
        </Field>
        {company && <Check name="is_active" label="この会社を使用する" defaultChecked={company.is_active} />}
      </Section>
      <SaveBar pending={pending} error={state?.error} label={company ? "保存する" : "登録する"} />
      {state?.ok && <Toast key={state.at} message="保存しました" />}
    </form>
  );
}
