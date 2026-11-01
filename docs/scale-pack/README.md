# EduFaso "Large-school scale pack" — proposal for review

Status: **PROPOSAL. Nothing has been applied to the live database, nothing has been pushed to GitHub, the laptop was not touched.**
Everything was built in a copy (`/workspace/scale-pack-work/educationconnect`, branch `scale-pack`, based on GitHub `main` at `fec0759`) and tested on a local replica with the same data shape as live.
Prepared Oct 31, 2026 (America/Chicago).

## 1. What this is, in plain English

EduFaso works well for small schools, but with a school of ~2,000 students (like the TEST Ollie Grande Ecole) three things go wrong:

1. **Lists get cut off silently.** The database API never returns more than 1,000 rows. Several pages counted or listed things in the browser, so with more than 1,000 rows the numbers were simply wrong (attendance totals, students without a class, a student's attendance rate, the messages contact list, parents' children…).
2. **Pages download everything.** Élèves, Parents, Users, attendance and bulletins fetched whole tables (the Parents page also built a request URL so long that it failed).
3. **The database does a lot of repeated work.** The security rules (RLS) call helper functions once for every row, and some important columns have no index. Counting 370k attendance marks took 7-11 seconds for a school admin / teacher.

The pack fixes all three without changing who can see or do what.

## 2. What is in this folder

| File / folder | What it is |
|---|---|
| `scale-pack.patch` | The app code change (`git diff main`, 21 files). Applies cleanly to `main@fec0759` (`git apply --check` passed). |
| `migrations/` | 4 SQL migrations (new versions 20261101100000…130000; live is at 20261031103511). |
| `rollback/` | The matching `.down.sql` for each one. |
| `TIMINGS.md` | Before/after numbers (database, browser page loads, grade save). |
| `vite-build.log` | Output of the final production build (passes). |
| `tools/` | The scripts I used (see section 8). |
| `results/` | Raw outputs: RLS equivalence, RPC security diff, benchmarks, page loads, UI functional run, tsc comparison. |
| `shots/` | Screenshots from the UI test runs. |

## 3. The four migrations (apply in this order)

1. `20261101100000_scale_indexes` — 13 new indexes (presences by student+date and date+class, notes by student and class+subject, inscriptions, classes, roles, messages, parent links, teaching assignments, timetable, temp credentials). Plain `CREATE INDEX IF NOT EXISTS`. Takes a short write-lock per table while it builds; on live (370k presences) that should be seconds. For zero blocking, run the statements one by one with `CREATE INDEX CONCURRENTLY` (outside a transaction) instead.
2. `20261101110000_scale_rls_helpers` — 11 new small helper functions `ef_my_*()` ("which classes/schools/children are mine", computed once per query). Read-only, `SECURITY DEFINER` with a fixed `search_path`, same logic as the existing helpers.
3. `20261101120000_scale_rls_policies` — rewrites the *wording* of the existing 43 RLS policies (43 `ALTER POLICY` statements) using `ALTER POLICY` (not drop/create, so there is never a moment without a policy): `auth.uid()` / `ef_is_super_admin()` become `(select …)` so they run once, and per-row helper calls become `col in (select ef_my_…())`. **The access rules are meant to be identical.** Runs in one transaction; `ALTER POLICY` takes a very brief exclusive lock per table — apply at a quiet time.
4. `20261101130000_scale_rpcs` — 18 read-only functions the new pages call (paged lists with search, counts, home stats, attendance summary, class averages, message contacts…). All are `SECURITY INVOKER`, so **the caller's own RLS still decides what they see**; they are revoked from `public`/`anon` and granted only to `authenticated` and `service_role`.

Safe ordering: 1, 2, 3, 4 first, **then deploy the new app**. The old app keeps working with the new policies/indexes (nothing was removed), so migrations can go in before the app.

## 4. What changed in the app (per page)

- **Élèves**: 100 per page + "Afficher plus", server-side search, class filter with exact counts.
- **Parents**: server-side paging and search ("Affichage de X sur Y parents"). Fixes the too-long-URL failure. Export still exports *all* parents. The student picker searches on the server.
- **Utilisateurs (super admin)**: 50 per page, role/school/class filters and search on the server, exact totals.
- **Présences (école)**: day totals are exact (database count, not the first 1,000 rows); absent / excused / all lists load page by page.
- **Tableau de bord école**: all home stats in one call; exams = two small queries.
- **Bulletins**: paged, server search, plus a new **"Toute la classe (ZIP)"** button (all bulletins of a class as one ZIP, 3 PDFs at a time with a progress label). Adds the small `fflate` dependency (already installed through jsPDF; `package.json`/lock updated).
- **Mes classes (teacher)**, **Parent home**, **Student home / Mes présences / Enfant présences**: counts, averages and attendance rates come from the database, so they are exact above 1,000 rows. Parent home makes 1 call instead of 5 per child.
- **Messages**: contacts for admin/teacher come from one function; sent announcements show the real recipient count.
- **Saisie des notes**: saving is now 3 requests instead of one per student, and **every error is shown** ("Certaines notes n'ont pas été enregistrées (…)") instead of being lost silently.

## 5. Security — what was checked, and what you must re-check after applying

Proven locally (replica built from live; live's 43 policy definitions and the 30 shared `ef_` helper functions were fingerprint-compared read-only against the replica and match):

- **RLS equivalence**: `tools/rls-equivalence.sql` records, for 21 test users (super admin, school admins incl. one with two schools and inactive ones, teachers incl. partial and other-school, parents incl. inactive child, students incl. dropped / no class, a user with no roles, an unknown uid), the visibility of 20 tables and the outcome of a battery of writes. **All 1,176 results are identical before and after** (`results/eq-before.tsv` = `results/eq-after.tsv`).
- **The new RPCs do not widen access**: `tools/rpc-security.sql` calls all 18 as each of the 21 users for the big school; results are the same under old and new policies except hashes that reflect data the UI test changed in between (I checked: only `last_login_at` of one student and the grades the test saved). Outsiders (other-school teacher, no-role user, unknown uid, small-school admin) get 0 / empty from every school RPC.
- **anon cannot run any new function** (`permission denied`); `has_function_privilege('anon', …)` is false for all of them.
- **A teacher without rights cannot save grades**: the upsert returns RLS error 42501, which the UI now shows.
- `platform_settings` stays super-admin only (checked directly: super sees 1 row, everyone else 0, before and after; the equivalence harness reports an error for that one table in both runs only because the table has no `id` column).

Note: any logged-in user can pass any `p_school` to an RPC, but gets only what their own RLS would let a normal query return (0 for another school). `ef_message_contacts(p_school, p_role)` takes the role as a parameter: a student asking for `school_admin` gets only the staff rows they could already read.

**Please verify on live right after step 3 and again after step 4** (all read-only, all quick):
1. `select count(*) from pg_policies where schemaname='public'` is still 43, with the same policy names as before (the migration only changes their wording).
2. Re-run the existing security probes (`/workspace/qa/sec*.mjs`, `probes*.mjs`) against live and compare with the last clean run — expect no change.
3. Log in as TEST Ollie users (admin, big-school teacher, parent, student, outsider) and compare what each sees with `results/eq-after.tsv` / `results/functional-after.json`; super admin: open Paramètres (platform_settings).
4. `select has_function_privilege('anon', p.oid, 'execute') from pg_proc p where proname in ('ef_students_page','ef_parents_page','ef_admin_users_page')` → all false.
5. Supabase Advisors (security + performance) before vs after.

Pre-existing, not changed by this pack (worth a later look): the older helpers `ef_is_super_admin`, `ef_is_school_admin`, `ef_primary_role`, `ef_user_*` are still executable by `anon` (harmless: they read `auth.uid()` which is null for anon).

## 6. Results at a glance (details in `TIMINGS.md`)

- Counting attendance as school admin: **7.0 s -> 66 ms**; as teacher **11.6 s -> 79 ms**; parent notes **2.4 s -> 15 ms**.
- Full RLS equivalence suite (21 users): **>12 min -> 7.5 s**.
- Browser, with 200 ms delay per request: Élèves **6.1 s -> 1.9 s**, Parents **8.2 s -> 2.0 s**; downloaded data on Élèves **929 KB -> 16 KB**, Parents **1.1 MB -> 58 KB**, Admin users **756 KB -> 9 KB**.
- Saving 50 grades: **50 requests / 10.4 s -> 3 requests / 0.64 s**, and errors are visible.
- UI functional suite (22 checks incl. exact counts above 1,000, paging, search, ZIP of 50 PDFs): **all pass**.
- `npx vite build` passes (`vite-build.log`). `tsc`: 37 errors vs 41 on main — none new (see "Notes" below).

## 7. Apply steps (when you decide to)

Do this at a quiet time, with a database backup / point-in-time-recovery marker noted first. **Never touch the ChurchFlow project (`uszmpknbnpsenoahivkf`); the project is EduFaso `hbfjtsxzueftoiryzhxh`.**

1. Note the time. Take a manual backup (or confirm PITR).
2. Apply `migrations/20261101100000_scale_indexes.sql`. Check: the 13 indexes exist (`select indexname from pg_indexes where indexname in (…)`).
3. Apply `…110000_scale_rls_helpers.sql`. Check: `select proname from pg_proc where proname like 'ef\_my\_%'` → 11 rows (step 5 later adds a 12th, `ef_my_children_summary`).
4. Apply `…120000_scale_rls_policies.sql`. Run the section-5 checks immediately. If anything looks different, run the rollback (section 8) at once.
5. Apply `…130000_scale_rpcs.sql`. Run check 4 of section 5.
6. Install and deploy the app: `git checkout -b scale-pack main && git apply scale-pack.patch && npm install && npm run build`-equivalent (`npx vite build`, see Notes) then deploy as usual.
7. Smoke test as TEST Ollie users (the UI test in `tools/functional-local.mjs` can be pointed at the deployed site with `BASE=…`).

## 8. Rollback steps

Reverse order, each file is independent and safe to run twice:
1. **Roll the app back first** (redeploy the previous build) — otherwise pages calling the new functions will error.
2. `rollback/20261101130000_scale_rpcs.down.sql` (drops the 18 functions).
3. `rollback/20261101120000_scale_rls_policies.down.sql` (puts back the exact original policy wording — verified: live's policy fingerprints equal the replica "before" state these files restore).
4. `rollback/20261101110000_scale_rls_helpers.down.sql`.
5. `rollback/20261101100000_scale_indexes.down.sql` (drops the indexes; harmless to keep them).

## 9. Notes, risks and known limits

- **Build**: `npm run build` = `tsc -b && vite build`. `main` already fails `tsc -b` (41 pre-existing type errors), so the deploy must be using `vite build` alone; the pack has 37 errors, all pre-existing (`results/tsc-vs-baseline.txt` shows only lines that disappeared). `npx vite build` passes.
- **`npm install`** once after applying the patch to refresh `package-lock.json` for `fflate` (the lock entry already exists as a jsPDF dependency; the patch adds the root dependency line).
- **Class switch flash**: on Élèves/Bulletins, when you change class the previous list stays visible for a moment until the new one arrives (kept-previous-data behaviour).
- **Still capped at 1,000** (not changed): the message inbox query and "sent direct messages" list; parent/student message contacts; the compose-message recipient picker is not server-side yet. These are the natural next step.
- The RLS rewrite is the part that most deserves a human review: it is mechanical and was tested for equivalence on 21 user types, but it touches every table's policy. The migration is one transaction, so if it errors nothing changes.
- Locks: index build (short write lock per table) and `ALTER POLICY` (very short exclusive lock) — avoid school hours.
- Timings are from a local replica with simulated 200 ms latency; live numbers will differ in absolute terms.
- Local data differences between the "before" and "after" databases (a few `last_login_at` values, grades saved by the UI test) explain the only differences in `results/rpc-sec-*.txt`; row counts/totals are identical.

## 10. Tools (all local-only, test data only)

- `tools/rls-equivalence.sql` — the before/after security equivalence harness (`eq.run('before'|'after')`).
- `tools/rpc-security.sql` — every RPC × every test user; diff the output between policy versions.
- `tools/bench-sql.sh <db>` — database timings as a given user.
- `tools/page-loads-local.mjs` — Chrome page-load timings for all roles (env `BASE`, `API`, `OUT`, `NOSHOTS`).
- `tools/functional-local.mjs` — the UI functional suite.
- `tools/grade-save-bench.mjs` — old vs new grade save + error check.
