// スタッフごとに Supabase Auth ユーザー（パスワード未設定）を作成し staff.auth_user_id に紐付ける。メールは送らない
// 使い方: node --env-file=.env.local scripts/create-auth-users.mjs backups/xxx.json [--email=<staffId>:<address>] [--apply]
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const apply = args.includes("--apply");
const overrides = new Map(
  args.filter((a) => a.startsWith("--email=")).map((a) => {
    const [id, email] = a.slice(8).split(":");
    return [id, email.trim().toLowerCase()];
  }),
);
if (!file) throw new Error("バックアップJSONのパスを指定してください");
const { authUsers = [] } = JSON.parse(readFileSync(file, "utf8"));
const firebaseLastSignIn = new Map(authUsers.map((u) => [u.uid, u.lastSignIn ? new Date(u.lastSignIn).toISOString() : null]));

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: staff, error } = await sb.from("staff").select("id, firebase_uid, name, email, retired, auth_user_id");
if (error) throw error;

const existing = new Map();
for (let page = 1; ; page++) {
  const { data, error: e } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
  if (e) throw e;
  for (const u of data.users) existing.set(u.email?.toLowerCase(), u.id);
  if (data.users.length < 1000) break;
}

const plan = { create: [], link: [], skipRetired: [], already: [] };
for (const s of staff) {
  const email = overrides.get(s.id) ?? s.email?.trim().toLowerCase();
  const row = { ...s, email, lastSignIn: firebaseLastSignIn.get(s.firebase_uid ?? s.id) ?? null };
  if (s.auth_user_id) plan.already.push(row);
  else if (s.retired) plan.skipRetired.push(row);
  else if (existing.has(email)) plan.link.push({ ...row, authId: existing.get(email) });
  else plan.create.push(row);
}
console.log(`新規作成 ${plan.create.length} / 既存に紐付け ${plan.link.length} / 紐付け済み ${plan.already.length} / 退職のため作成しない ${plan.skipRetired.length}`);
for (const s of plan.skipRetired) console.log(`  退職: ${s.name}`);
for (const [id, email] of overrides) console.log(`  メール上書き: ${staff.find((s) => s.id === id)?.name ?? id} → ${email}`);

if (!apply) {
  console.log("\n（検証のみ。実行するには --apply）");
  process.exit(0);
}

for (const s of staff) {
  const lastSignIn = firebaseLastSignIn.get(s.firebase_uid ?? s.id);
  if (!lastSignIn) continue;
  await sb.from("staff").update({ firebase_last_sign_in_at: lastSignIn }).eq("id", s.id);
  await sb.from("login_history").upsert(
    { staff_id: s.id, signed_in_at: lastSignIn, source: "firebase" },
    { onConflict: "staff_id,signed_in_at,source", ignoreDuplicates: true },
  );
}

for (const s of [...plan.create, ...plan.link]) {
  let authId = s.authId;
  if (!authId) {
    const { data, error: e } = await sb.auth.admin.createUser({
      email: s.email,
      email_confirm: true,
      user_metadata: { staff_id: s.id, name: s.name },
    });
    if (e) { console.log(`✖ ${s.name}: ${e.message}`); continue; }
    authId = data.user.id;
  }
  const patch = { auth_user_id: authId };
  if (overrides.has(s.id)) patch.email = s.email;
  const { error: e2 } = await sb.from("staff").update(patch).eq("id", s.id);
  console.log(e2 ? `✖ ${s.name}: ${e2.message}` : `✔ ${s.name}`);
}
console.log("完了");
