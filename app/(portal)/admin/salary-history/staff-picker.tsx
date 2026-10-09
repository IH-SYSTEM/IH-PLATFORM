"use client";

import { useState } from "react";

type Company = { id: string; name: string };
type Store = { id: string; name: string; company_id: string | null };
type Person = { id: string; name: string; retired: boolean; store_id: string | null };

const select = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

/** 会社 → 店舗 → スタッフの順にしぼり込んで選ぶ */
export function StaffPicker({ companies, stores, staff, selected }: { companies: Company[]; stores: Store[]; staff: Person[]; selected: string }) {
  const initialStore = staff.find((s) => s.id === selected)?.store_id ?? "";
  const [company, setCompany] = useState(stores.find((s) => s.id === initialStore)?.company_id ?? "");
  const [store, setStore] = useState(initialStore);
  const [person, setPerson] = useState(selected);

  const storeList = stores.filter((s) => !company || s.company_id === company);
  const storeIds = new Set(storeList.map((s) => s.id));
  const people = staff.filter((p) => (store ? p.store_id === store : !company || (p.store_id && storeIds.has(p.store_id))));

  return (
    <form className="flex flex-wrap gap-2">
      <select
        value={company}
        onChange={(e) => {
          setCompany(e.target.value);
          setStore("");
          setPerson("");
        }}
        className={select}
        aria-label="会社"
      >
        <option value="">すべての会社</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        value={store}
        onChange={(e) => {
          setStore(e.target.value);
          setPerson("");
        }}
        className={select}
        aria-label="店舗"
      >
        <option value="">すべての店舗</option>
        {storeList.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select name="staff" value={person} onChange={(e) => setPerson(e.target.value)} className={`min-w-56 ${select}`} aria-label="スタッフ">
        <option value="">スタッフを選択（{people.length}名）</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.retired ? "（退職）" : ""}
          </option>
        ))}
      </select>
      <button disabled={!person} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-2 disabled:opacity-50">
        表示する
      </button>
    </form>
  );
}
