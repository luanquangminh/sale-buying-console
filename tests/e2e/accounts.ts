import { existsSync, readFileSync } from "node:fs";

/* Logins for the environment under test. Copy accounts.example.json to accounts.json (git-ignored) and fill it in. */
type Account = { username: string; password: string; name?: string };
const file = new URL("./accounts.json", import.meta.url);
if (!existsSync(file)) throw new Error("tests/e2e/accounts.json is missing — copy tests/e2e/accounts.example.json and fill in the logins of the target environment");
export const A = JSON.parse(readFileSync(file, "utf8")) as Record<"admin" | "sale" | "buyer" | "warehouse", Account>;
