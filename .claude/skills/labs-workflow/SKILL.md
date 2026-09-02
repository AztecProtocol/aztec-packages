---
name: labs-workflow
description: Work across the foundation (aztec-packages), aztec-packages-private and the labs repo (aztec-node) — changing labs from the foundation as patches, upstreaming or porting to aztec-node, bumping the labs pin, private/public prototyping and release testing. Use when a task touches labs/, labs-patches/, the submodule pin, an aztec-node PR, or the private repo.
---

Read `REPO.md` at the repo root first; it is the whole workflow on one page. Everything goes through `scripts/labs <verb>`:

| Verb | Use |
|---|---|
| `apply` / `status` / `export` / `check` | series on the checkout; `status` lists unexported commits |
| `upstream <n>... [--push]` | one aztec-node PR from the named patches (batch what belongs together) |
| `port <pr> [--push]` | replay a labs-only aztec-packages PR onto aztec-node main |
| `bump <ref> [--commit\|--pr]` | move the pin, re-apply, commit gitlink + foundry locks + patches, open the PR |
| `run <cmd>` | a command inside labs/ with the right environment |

Rules that prevent real mistakes:
- Never stage the `labs` gitlink by hand; the pin moves only with `bump`. The pre-commit hook refuses a gitlink that points at a patch or marker commit.
- Commits inside `labs/` re-export the series; commit the regenerated `labs-patches/*.patch` in the foundation PR.
- A PR that mixes foundation and labs files is not ported; split it.
- `--push` on `upstream`/`port` needs aztec-node write access (labs employees). Without it, stop after the patch files or the prepared branch — never attempt the push.
- Private prototypes with no private content go into the private repo's `public-next`, never `next`.
