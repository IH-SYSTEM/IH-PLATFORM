"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteFile } from "./actions";

export function DeleteFileButton({ fileId, name }: { fileId: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`「${name}」を削除します。元に戻せません。よろしいですか？`)) return;
        start(async () => {
          const r = await deleteFile(fileId);
          if ("error" in r) alert(r.error);
          router.refresh();
        });
      }}
      className="text-xs text-slate-400 hover:text-accent"
    >
      {pending ? "削除中…" : "削除"}
    </button>
  );
}
