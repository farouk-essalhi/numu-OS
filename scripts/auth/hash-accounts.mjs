#!/usr/bin/env node
// Builds the NUMU_ACCOUNTS value for Netlify from a list of people and passwords.
//
//   node scripts/auth/hash-accounts.mjs people.json > accounts.json
//
// people.json (keep it OUT of the repo): [{ "email": "rand@numu.test", "memberId": "tm-rand", "password": "..." }]
// Output: [{ email, memberId, salt, hash }] where hash = scrypt(password, salt, 32), hex.
// Paste the output into Netlify → Project configuration → Environment variables →
// NUMU_ACCOUNTS (mark it secret), then redeploy. Changing it resets those passwords.
import { randomBytes, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/auth/hash-accounts.mjs people.json");
  process.exit(1);
}
const people = JSON.parse(readFileSync(file, "utf8"));
const out = people.map(({ email, memberId, password }) => {
  if (!email || !memberId || !password || password.length < 10) throw new Error(`Bad entry for ${email ?? "?"}: need email, memberId and a password of 10+ characters`);
  const salt = randomBytes(16).toString("hex");
  return { email: email.toLowerCase(), memberId, salt, hash: scryptSync(password, salt, 32).toString("hex") };
});
process.stdout.write(JSON.stringify(out));
