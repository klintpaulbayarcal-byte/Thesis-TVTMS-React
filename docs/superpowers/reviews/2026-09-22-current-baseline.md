# TVTMS current release baseline

**Date:** 2026-09-22. **Candidate:** `feature/tvtms-defense-readiness` at `86dfdb6f6b928328d60aec67aec5dcd84f4b1380`. **Production baseline:** `origin/sync-v4` at `16780da4c90be56d9bf6541dcee58611d5de15e4`.

| Gate | Result | Current evidence |
| --- | --- | --- |
| Remote branch identity | PASS | Fresh `git fetch`; supplied feature and production SHAs still match. Feature is 49 commits ahead and 0 behind `sync-v4`. |
| Local regression baseline | PASS | `npm test`: 171 passed. |
| Exact-commit CI | PASS | GitHub run `35727352827` completed successfully for `86dfdb6`. |
| Open pull requests | PASS / informational | One open PR: #1, `sync-v4` to `main`; it is unrelated to merging the feature candidate into production. |
| Required branch checks | NOT VERIFIED | Anonymous GitHub API cannot read branch-protection details; authenticated GitHub CLI token is invalid. |
| Full dependency audit | FAIL | Four advisories: Vite high, esbuild moderate, React Router and React Router DOM moderate. |
| Production-only audit | FAIL | Two moderate React Router advisories. |
| Live database facts | NOT VERIFIED in this run | No read-only SQL/staging connection is available in the isolated worktree. Prior report evidence is historical, not reclassified as current proof. |
| Authenticated staging workflows | NOT VERIFIED | No isolated staging URL, test Admin/Officer sessions, or synthetic fixture database is available. |
| Production backup/restore | NOT VERIFIED | No Hostinger/Supabase backup readback or restore rehearsal is available. |
| Production deployment | NOT APPLICABLE now | Conditional authorization does not mature while mandatory gates remain NOT VERIFIED. |

No production write, migration, notification, ticket, payment, dispute, merge, or deployment was performed while establishing this baseline.
