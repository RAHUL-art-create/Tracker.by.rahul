/*
 * EXAMPLE ONLY - safe to commit (contains no real credentials).
 *
 * For LOCAL testing:
 *   1. Copy this file:  cp supabase-config.example.js supabase-config.js
 *   2. Paste your real Supabase project URL + anon key in the copy.
 *   3. supabase-config.js is gitignored, so it will never be committed.
 *
 * For GitHub Pages (production):
 *   Do NOT commit this. The deploy workflow builds supabase-config.js
 *   automatically from the repo secrets SUPABASE_URL and SUPABASE_ANON_KEY.
 */
window.SUPABASE_CONFIG = null;
