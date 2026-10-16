/**
 * Creates demo login accounts (one per role) for local dev and previews.
 * Idempotent: existing users are updated, not duplicated.
 *
 *   pnpm seed:users
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
 * .env.local. SEED_PASSWORD sets the password; it may only be left unset
 * against a local Supabase.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}

const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(url);
const password = process.env.SEED_PASSWORD ?? (isLocal ? "safesight-demo" : "");
// Demo accounts only: 6 is Supabase Auth's floor. Real sign-ups still need 8
// (signupSchema). Change the demo password before any real users join.
if (password.length < 6) {
  console.error("Set SEED_PASSWORD (6+ characters) to seed a hosted project.");
  process.exit(1);
}

// Invented names only (CLAUDE.md).
const demoUsers = [
  { email: "teacher@demo.safesight.in", fullName: "Kavita Sharma", role: "teacher" },
  { email: "riya@demo.safesight.in", fullName: "Riya Sharma", role: "student" },
  { email: "admin@demo.safesight.in", fullName: "Arjun Mehta", role: "admin" },
] as const;

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserId(email: string) {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email === email);
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
}

for (const user of demoUsers) {
  let id = await findUserId(user.email);
  if (id) {
    const { error } = await supabase.auth.admin.updateUserById(id, { password });
    if (error) throw error;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: user.fullName },
    });
    if (error) throw error;
    id = data.user.id;
  }

  // Set the role with the service role: the sign-up trigger never grants
  // teacher-by-default or admin.
  const { error } = await supabase
    .from("profiles")
    .upsert({ id, role: user.role, full_name: user.fullName });
  if (error) throw error;

  console.log(`${user.role.padEnd(8)} ${user.email}`);
}

console.log(isLocal && !process.env.SEED_PASSWORD ? "Password: safesight-demo" : "Password: $SEED_PASSWORD");
