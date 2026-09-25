// Firestore 全体と Firebase Auth ユーザーを読み取り専用で JSON に書き出す
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp, GeoPoint, DocumentReference } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const keyPath = process.argv[2] ?? "firebase-service-account.json";
const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function serialize(v) {
  if (v instanceof Timestamp) return { __ts: v.toDate().toISOString() };
  if (v instanceof GeoPoint) return { __geo: { lat: v.latitude, lng: v.longitude } };
  if (v instanceof DocumentReference) return { __ref: v.path };
  if (Array.isArray(v)) return v.map(serialize);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, serialize(x)]));
  }
  return v;
}

const docs = {};
async function walk(collections) {
  for (const col of collections) {
    const snap = await col.get();
    for (const d of snap.docs) {
      docs[d.ref.path] = serialize(d.data());
      await walk(await d.ref.listCollections());
    }
    // 親ドキュメントが存在しないサブコレクションも拾う
    for (const ref of await col.listDocuments()) {
      if (!docs[ref.path]) await walk(await ref.listCollections());
    }
  }
}
await walk(await db.listCollections());

const authUsers = [];
let pageToken;
do {
  const res = await getAuth().listUsers(1000, pageToken);
  for (const u of res.users) {
    authUsers.push({ uid: u.uid, email: u.email ?? null, disabled: u.disabled, createdAt: u.metadata.creationTime, lastSignIn: u.metadata.lastSignInTime });
  }
  pageToken = res.pageToken;
} while (pageToken);

mkdirSync("backups", { recursive: true });
const out = `backups/firestore-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(out, JSON.stringify({ projectId: serviceAccount.project_id, exportedAt: new Date().toISOString(), docs, authUsers }, null, 2));

const counts = {};
for (const p of Object.keys(docs)) {
  const parts = p.split("/");
  const key = parts.filter((_, i) => i % 2 === 0).join("/*/");
  counts[key] = (counts[key] ?? 0) + 1;
}
console.log(`Saved ${out}`);
console.table(counts);
console.log(`Auth users: ${authUsers.length}`);
