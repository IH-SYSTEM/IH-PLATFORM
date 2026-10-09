"use client";

import { useState } from "react";

// 居酒屋でよくある役割。新しい店で役割が空のときに、ワンタップで入れられるようにする
export const IZAKAYA_ROLES = ["ホール", "キッチン", "キッチンアシスタント", "ドリンカー", "キャッシャー", "案内", "呼び込み", "バッシング", "洗い場", "仕込み"];
const MAX_ROLES = 20;
const MAX_LENGTH = 20;

/** シフトの役割の一覧。［役割を追加］で足し、×で外す（このページは管理者だけが開ける） */
export function RoleEditor({ initial }: { initial: string[] }) {
  const [roles, setRoles] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const name = draft.trim();
    if (!name) return;
    if (name.length > MAX_LENGTH) return setError(`${MAX_LENGTH}文字以内で入れてください`);
    if (roles.includes(name)) return setError("同じ役割がすでにあります");
    if (roles.length >= MAX_ROLES) return setError(`役割は${MAX_ROLES}個までです`);
    setRoles([...roles, name]);
    setDraft("");
    setError(null);
  };

  return (
    <div className="space-y-3 sm:col-span-2 lg:col-span-3">
      <input type="hidden" name="work_roles" value={roles.join("\n")} />
      {roles.length ? (
        <ul className="flex flex-wrap gap-2">
          {roles.map((r) => (
            <li key={r} className="flex items-center gap-1 rounded-full bg-brand-soft py-1 pl-3 pr-1 text-sm font-bold text-brand">
              {r}
              <button
                type="button"
                onClick={() => setRoles(roles.filter((x) => x !== r))}
                aria-label={`${r}を外す`}
                className="grid size-6 place-items-center rounded-full text-brand/60 hover:bg-white hover:text-accent"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          役割はまだありません。
          <button type="button" onClick={() => setRoles(IZAKAYA_ROLES)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:border-brand">
            居酒屋でよくある役割を入れる
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          maxLength={MAX_LENGTH}
          placeholder="例：焼き場"
          className="w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button type="button" onClick={add} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-2">
          ＋ 役割を追加
        </button>
        {error && <span className="text-sm font-bold text-accent">{error}</span>}
      </div>
      <p className="text-xs text-slate-400">役割を外しても、すでに確定したシフトの役割は消えません。変更は画面下の［保存する］で反映されます</p>
    </div>
  );
}
