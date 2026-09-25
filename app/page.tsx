import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";

export default async function Home() {
  const staff = await requireStaff();
  redirect(staff.isAdmin ? "/admin" : "/me");
}
