import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { StoreForm } from "../store-form";
import { saveStore } from "../actions";

export default async function StoreNewPage() {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <Link href="/admin/stores" className="text-sm text-slate-500 hover:text-slate-800">
          ← 店舗一覧
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">店舗を登録</h1>
      </div>
      <StoreForm store={null} staff={[]} action={saveStore.bind(null, null)} createdNotice={false} />
    </div>
  );
}
