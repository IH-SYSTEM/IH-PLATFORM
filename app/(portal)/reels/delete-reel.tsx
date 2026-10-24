"use client";

import { useTransition } from "react";
import { deleteReel } from "./actions";

export function DeleteReel({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => confirm("このリールを消しますか？（元に戻せません）") && start(async () => void (await deleteReel(id)))}
      className="shrink-0 text-xs text-slate-400 hover:text-accent"
    >
      {pending ? "…" : "消す"}
    </button>
  );
}
