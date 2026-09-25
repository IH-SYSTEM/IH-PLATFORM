import "server-only";

// 旧システムの公開 Web API キー（firebase-config.js でブラウザに配布済みのもの。秘密情報ではない）
const FIREBASE_WEB_API_KEY = "AIzaSyBjZ1QdFy6yaCKG0z59ECpmKi5P1Mr28uY";

// 旧 Firebase Auth でメール・パスワードが正しいか確認し、正しければ Firebase の uid を返す
export async function verifyFirebasePassword(email: string, password: string): Promise<string | null> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: false }),
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { localId?: string };
  return body.localId ?? null;
}
