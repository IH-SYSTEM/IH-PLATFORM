"use client";

import { startTransition, useActionState } from "react";
import { Toast } from "@/app/toast";
import { Check, Field, SaveBar, Section, inputClass as input } from "../form-ui";
import type { StoreSaveState } from "./actions";

export type StoreRecord = {
  id: string;
  name: string;
  address: string | null;
  sort_order: number | null;
  lat: number | null;
  lng: number | null;
  open_time: string | null;
  close_time: string | null;
  monthly_holidays: number | null;
  default_paid_leave: number | null;
  target_labor_cost_rate: number | null;
  rosai_rate: number | null;
  scheduled_clock_out: string | null;
  notification_delay_min: number | null;
  geofence_enabled: boolean;
  geofence_radius: number | null;
  wifi_enabled: boolean;
  allowed_ips: string[];
  manager_staff_ids: string[];
  is_active: boolean;
};

const pct = (v: number | null) => (v === null ? "" : String(Math.round(v * 100000) / 1000));

export function StoreForm({
  store,
  staff,
  action,
  createdNotice,
  children,
}: {
  store: StoreRecord | null;
  staff: { id: string; name: string }[];
  action: (prev: StoreSaveState, fd: FormData) => Promise<StoreSaveState>;
  createdNotice: boolean;
  children?: React.ReactNode;
}) {
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
      <Section title="基本情報">
        <Field label="店舗名" required>
          <input name="name" defaultValue={store?.name ?? ""} required className={input} />
        </Field>
        <Field label="表示順" hint="小さい順に並びます">
          <input name="sort_order" inputMode="numeric" defaultValue={store?.sort_order ?? ""} className={input} />
        </Field>
        {store && <Check name="is_active" label="この店舗を使用する" defaultChecked={store.is_active} />}
        <Field label="住所" className="sm:col-span-2 lg:col-span-3">
          <input name="address" defaultValue={store?.address ?? ""} className={input} />
        </Field>
      </Section>

      <Section title="営業・休日">
        <Field label="開店時刻">
          <input name="open_time" type="time" defaultValue={store?.open_time ?? ""} className={input} />
        </Field>
        <Field label="閉店時刻">
          <input name="close_time" type="time" defaultValue={store?.close_time ?? ""} className={input} />
        </Field>
        <Field label="月の公休日数">
          <input name="monthly_holidays" inputMode="numeric" defaultValue={store?.monthly_holidays ?? ""} className={input} />
        </Field>
        <Field label="有給休暇の初期日数">
          <input name="default_paid_leave" inputMode="numeric" defaultValue={store?.default_paid_leave ?? ""} className={input} />
        </Field>
      </Section>

      <Section title="人件費">
        <Field label="目標人件費率（%）">
          <input name="target_labor_cost_rate" inputMode="decimal" defaultValue={pct(store?.target_labor_cost_rate ?? null)} className={input} />
        </Field>
        <Field label="労災保険料率（%）" hint="例：0.3">
          <input name="rosai_rate" inputMode="decimal" defaultValue={pct(store?.rosai_rate ?? null)} className={input} />
        </Field>
      </Section>

      {store && staff.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">店長</h2>
          <p className="mt-0.5 text-xs text-slate-500">この店舗に所属する在籍スタッフから選びます</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {staff.map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name="manager_staff_ids"
                  value={s.id}
                  defaultChecked={store.manager_staff_ids.includes(s.id)}
                  className="size-4 rounded border-slate-300"
                />
                {s.name}
              </label>
            ))}
          </div>
        </section>
      )}

      <Section title="打刻設定" note="打刻機能は新システムにまだ移行していないため、現在は使われていません（設定値は保持されます）">
        <Field label="定時退勤時刻">
          <input name="scheduled_clock_out" type="time" defaultValue={store?.scheduled_clock_out ?? ""} className={input} />
        </Field>
        <Field label="退勤忘れ通知（分後）">
          <input name="notification_delay_min" inputMode="numeric" defaultValue={store?.notification_delay_min ?? ""} className={input} />
        </Field>
        <Field label="打刻可能範囲（m）">
          <input name="geofence_radius" inputMode="numeric" defaultValue={store?.geofence_radius ?? ""} className={input} />
        </Field>
        <Field label="緯度">
          <input name="lat" inputMode="decimal" defaultValue={store?.lat ?? ""} className={input} />
        </Field>
        <Field label="経度">
          <input name="lng" inputMode="decimal" defaultValue={store?.lng ?? ""} className={input} />
        </Field>
        <Check name="geofence_enabled" label="QR打刻で位置情報を確認する" defaultChecked={store?.geofence_enabled} />
        <Check name="wifi_enabled" label="WiFi打刻を使う" defaultChecked={store?.wifi_enabled} />
        <Field label="WiFi打刻の許可IPアドレス" hint="複数ある場合は改行で区切ります" className="sm:col-span-2">
          <textarea name="allowed_ips" rows={2} defaultValue={store?.allowed_ips.join("\n") ?? ""} className={`${input} font-mono`} />
        </Field>
      </Section>

      {children}

      <SaveBar pending={pending} error={state?.error} label={store ? "保存する" : "登録する"} />
      {state?.ok && <Toast key={state.at} message="保存しました" />}
      {state?.error && <Toast key={state.at} message={state.error} tone="error" />}
      {createdNotice && !state && <Toast message="店舗を登録しました" />}
    </form>
  );
}
