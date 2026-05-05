# Proposed CI changes

This directory contains proposed changes to `.github/workflows/` files.
The Claude session that produced these did not have `ci-allow` permission, so
the actual workflow files are not modified — review the proposals here and copy
them into `.github/workflows/` when accepted.

## `workflows/nightly-release-tag.yml` and `workflows/nightly-release-tag-v4-next.yml`

**Problem.** The two nightly tag workflows unconditionally create a new
`v<version>-nightly.<YYYYMMDD>` tag every day, even when the source branch
(`next` / `v4-next`) has not moved since the previous run. The result is
multiple nightly tags pointing at the same commit, which:

- triggers redundant downstream `ci3.yml` builds (it runs on `push: tags: v*`)
  for byte-identical artifacts
- makes it look like the team is shipping new releases when nothing has changed
- masks the real problem when an upstream branch (notably `v4-next`) is not
  receiving merges for several days

Concrete example as of 2026-05-05:

| tag | commit |
| --- | --- |
| `v4.3.0-nightly.20260501` | `9b298a13` |
| `v4.3.0-nightly.20260502` | `9b298a13` |
| `v4.3.0-nightly.20260503` | `9b298a13` |
| `v4.3.0-nightly.20260504` | `9b298a13` |
| `v4.3.0-nightly.20260505` | `9b298a13` |

`9b298a13` is the tip of `v4-next` from 2026-04-30. No backports landed on
`v4-next` until `87af900f` on 2026-05-05 16:16 UTC — well after the 05:00 UTC
nightly run.

**Fix.** Before tagging, check whether the resolved `HEAD` already has any
`v*-nightly.*` tag pointing at it. If it does, log it and exit 0 — no new tag
is created and no downstream build is triggered. Also adds `workflow_dispatch`
to the `next` workflow so it can be manually re-run for testing.

This is the smallest possible behavioral change: the tag-name format, schedule,
permissions, and concurrency group are unchanged.
