import { requireStaff } from "@/lib/auth";
import { PageHeader } from "@/app/shell/page-header";
import { Chat } from "./chat";

export const metadata = { title: "AI取説" };

export default async function AiPage({ searchParams }: PageProps<"/ai">) {
  const me = await requireStaff();
  const { q } = await searchParams;
  return (
    <div className="space-y-4">
      <PageHeader title="AI取説" description="IH-PLATFORM の使い方を、AIに聞けます" />
      <Chat canSpar={me.permission === "superadmin"} initial={typeof q === "string" ? q.slice(0, 400) : undefined} />
    </div>
  );
}
