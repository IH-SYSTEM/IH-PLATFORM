// 指定スタッフのパスワード再設定リンクを発行し、このMacの既定ブラウザで直接開く（リンクは画面に出さない）
// 使い方: node --env-file=.env.local scripts/open-reset-link.mjs <email> [appUrl]
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";

const [email, appUrl = "http://localhost:3000"] = process.argv.slice(2);
if (!email) throw new Error("メールアドレスを指定してください");

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data, error } = await sb.auth.admin.generateLink({ type: "recovery", email });
if (error) throw new Error(error.message);

const url = new URL("/auth/confirm", appUrl);
url.searchParams.set("token_hash", data.properties.hashed_token);
url.searchParams.set("type", "recovery");
execFileSync("open", [url.toString()]);
console.log(`${email} の再設定画面をブラウザで開きました（リンクは1回限り有効）`);
