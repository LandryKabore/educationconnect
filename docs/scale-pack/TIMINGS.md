# Timings

All numbers come from a local replica of the live EduFaso data shape (370,143 presences, 60,041 notes, 3,602 profils; a 2,000-student TEST school). Nothing was measured on, or applied to, the live project. Times are in milliseconds unless stated; the machine was otherwise idle. Day: Oct 31, 2026 (America/Chicago).

## 1. Database: the same query under the OLD policies vs the NEW policies + indexes

Median of 3 runs, run as the given user (same JWT/role as the app). `OLD pattern` = what the old pages ask for; `NEW rpc` = what the new pages ask for. In the BEFORE column the new RPCs are run under the old policies, so you can see the new queries need the new policies to be fast.

| user | query | BEFORE (old policies) ms | AFTER (new policies + indexes) ms | speed-up |
|---|---|---:|---:|---:|
| admin_big | OLD pattern: day attendance rows (limit 1000) | 31.9 | 5.5 | 5.9x |
| admin_big | NEW rpc: ef_attendance_day_summary | 70.5 | 6.5 | 10.9x |
| admin_big | OLD pattern: students (profils limit 1000) | 35.8 | 8.8 | 4.1x |
| admin_big | NEW rpc: ef_students_page (100 rows+total) | 450.6 | 47.7 | 9.4x |
| admin_big | NEW rpc: ef_students_page search 'konat' | 503.1 | 101.6 | 5.0x |
| admin_big | NEW rpc: ef_school_home_stats | 181.6 | 18.2 | 10.0x |
| admin_big | NEW rpc: ef_parents_page | 300.1 | 47.8 | 6.3x |
| admin_big | count(*) presences | 7,014.4 | 66.3 | 105.8x |
| teacher1 | OLD pattern: presences (limit 1000) | 13.6 | 2.2 | 6.0x |
| teacher1 | OLD pattern: notes (limit 1000) | 226.6 | 5.0 | 44.9x |
| teacher1 | count(*) presences | 11,551.4 | 78.6 | 147.0x |
| teacher1 | NEW rpc: ef_teacher_class_stats | 319.9 | 9.6 | 33.3x |
| student1 | OLD pattern: own presences (limit 1000) | 22.5 | 2.6 | 8.8x |
| student1 | NEW rpc: ef_attendance_counts | 29.6 | 4.2 | 7.1x |
| parent1 | OLD pattern: notes (limit 1000) | 2,419.1 | 15.2 | 159.1x |
| parent1 | NEW rpc: ef_my_children_summary | 63.4 | 10.9 | 5.8x |
| super | OLD pattern: all profils (limit 1000) | 8.0 | 1.9 | 4.1x |
| super | NEW rpc: ef_admin_users_page (50 rows+total) | 40.2 | 5.7 | 7.0x |
| super | count(*) profils | 20.0 | 1.6 | 12.6x |

Biggest wins are the queries that touch every row of a big table (`count(*)` on presences: teacher 11.5 s -> 79 ms, school admin 7.0 s -> 66 ms; parent notes 2.4 s -> 15 ms). The small `limit 1000` reads were already quick in absolute terms (milliseconds) and are a few times quicker still.

Row-level-security equivalence check over 21 users (visibility hashes for 20 tables + write tests): old policies >12 minutes, new policies 7.5 seconds.

## 2. Browser page loads with 200 ms of network delay added to every API call

Production build in headless Chrome, first visit of each page (cold). BEFORE = current main; AFTER = scale pack + new migrations. 'API calls' and 'KB' are what the page fetched from the API.

| role | page | BEFORE ms | AFTER ms | API calls before -> after | KB before -> after |
|---|---|---:|---:|---|---|
| admin | / | 2,862 | 2,109 | 23 -> 19 | 364 -> 6 |
| admin | /ecole | 2,769 | 2,035 | 23 -> 19 | 364 -> 6 |
| admin | /classes | 2,314 | 1,854 | 25 -> 18 | 212 -> 16 |
| admin | /eleves | 6,088 | 1,871 | 47 -> 18 | 907 -> 15 |
| admin | /parents | 8,219 | 2,010 | 25 -> 17 | 1,114 -> 56 |
| admin | /enseignants | 2,615 | 1,876 | 28 -> 21 | 342 -> 145 |
| admin | /presences-ecole | 1,703 | 1,659 | 12 -> 10 | 174 -> 6 |
| admin | /bulletins | 1,861 | 1,423 | 14 -> 10 | 761 -> 15 |
| admin | /messages | 1,696 | 1,693 | 13 -> 12 | 1,174 -> 567 |
| admin | /annonces | 1,636 | 1,757 | 13 -> 12 | 1,174 -> 567 |
| admin | /eleves/:id | 1,816 | 2,241 | 19 -> 17 | 212 -> 44 |
| admin | /compositions-ecole | 1,699 | 1,657 | 16 -> 14 | 275 -> 107 |
| teacher | / | 2,681 | 2,689 | 14 -> 14 | 28 -> 28 |
| teacher | /mes-classes | 1,615 | 1,399 | 8 -> 7 | 181 -> 13 |
| teacher | /classes/:id | 1,249 | 1,245 | 9 -> 9 | 12 -> 12 |
| teacher | /classes/:id/notes | 2,013 | 2,082 | 14 -> 14 | 40 -> 40 |
| teacher | /classes/:id/presences | 1,409 | 1,398 | 8 -> 8 | 24 -> 24 |
| teacher | /mes-eleves | 1,437 | 1,414 | 7 -> 7 | 78 -> 78 |
| teacher | /presences | 1,672 | 1,625 | 8 -> 8 | 23 -> 23 |
| teacher | /messages | 2,210 | 1,223 | 12 -> 9 | 385 -> 125 |
| parent | / | 3,204 | 1,612 | 19 -> 11 | 6 -> 6 |
| parent | /enfants | 1,600 | 1,596 | 10 -> 10 | 3 -> 3 |
| parent | /enfants/:id/notes | 1,657 | 1,645 | 13 -> 13 | 26 -> 26 |
| parent | /enfants/:id/presences | 1,610 | 1,652 | 11 -> 12 | 25 -> 26 |
| parent | /enfants/:id/bulletin | 1,609 | 1,645 | 12 -> 12 | 3 -> 3 |
| parent | /messages | 1,882 | 1,811 | 15 -> 16 | 10 -> 10 |
| student | / | 3,124 | 3,135 | 17 -> 17 | 17 -> 15 |
| student | /mes-notes | 1,596 | 1,620 | 10 -> 10 | 25 -> 25 |
| student | /mes-presences | 1,431 | 1,453 | 8 -> 9 | 24 -> 25 |
| student | /mon-bulletin | 1,433 | 1,413 | 9 -> 9 | 2 -> 2 |
| student | /messages | 1,666 | 1,624 | 12 -> 13 | 7 -> 7 |
| superadmin | / | 1,459 | 1,451 | 8 -> 8 | 4 -> 4 |
| superadmin | /admin | 1,219 | 1,208 | 8 -> 8 | 4 -> 4 |
| superadmin | /admin/ecoles | 1,266 | 1,231 | 7 -> 7 | 4 -> 4 |
| superadmin | /admin/ecoles/:id | 1,419 | 1,421 | 9 -> 9 | 3 -> 3 |
| superadmin | /admin/utilisateurs | 1,436 | 1,242 | 10 -> 7 | 738 -> 8 |
| superadmin | /admin/rapports | 1,253 | 1,188 | 8 -> 8 | 4 -> 4 |
| superadmin | /admin/audit | 1,435 | 1,403 | 7 -> 7 | 3 -> 3 |
| superadmin | /messages | 1,230 | 1,316 | 8 -> 9 | 483 -> 565 |

Pages not listed as improved are unchanged on purpose (they were already small). No failed API calls (HTTP >= 400) on any page, before or after.

## 3. Saving grades (50 students, 200 ms per request)

```
notes in evaluation: 50
{"rows":50,"old":{"requests":50,"ms":10352,"errors":0},"new":{"requests":3,"ms":644},"rowsAfter":50}
other-school teacher upsert -> ERROR 42501 new row violates row-level security policy for table "notes"
```

Old code: 50 requests one after another = 10.4 s, and any failure was ignored. New code: 3 requests (delete / upsert / insert) = 0.64 s, and any failure is shown to the teacher. A teacher without rights gets a clear RLS error (42501) instead of silent loss.

## 4. Caveats on these numbers
- Local Postgres is faster than a small Supabase instance, and the 200 ms delay is an assumption for a phone on mobile data. The *relative* gains (and the request counts) carry over; absolute seconds on live will be different.
- The scale gap grows with data: the old pages download whole tables (and silently stop at 1,000 rows); the new pages download one page of 50-100 rows whatever the school size.
