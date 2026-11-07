/**
 * Create a user (first admin, or more agents) from the command line.
 *
 *   npx tsx scripts/create-user.ts --email you@example.com --name "Saiful" --role admin
 *
 * The password is read from the CRM_USER_PASSWORD env var; if unset, a random one
 * is generated and printed once.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { db, pool } from "../src/db";
import { users } from "../src/db/schema";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../src/lib/password";

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      role: { type: "string", default: "agent" },
    },
  });

  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim();
  const role = values.role;
  if (!email || !name || (role !== "admin" && role !== "agent")) {
    console.error('Usage: tsx scripts/create-user.ts --email <email> --name "<name>" [--role admin|agent]');
    process.exit(1);
  }

  let password = process.env.CRM_USER_PASSWORD;
  let generated = false;
  if (!password) {
    password = randomBytes(12).toString("base64url");
    generated = true;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(1);
  }

  await db.insert(users).values({ email, name, role, passwordHash: await hashPassword(password) });
  console.log(`Created ${role} ${email}`);
  if (generated) console.log(`Generated password (shown once): ${password}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
