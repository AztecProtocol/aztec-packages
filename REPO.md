# Working across aztec-packages, aztec-packages-private and aztec-node

Three repositories: **public** `AztecProtocol/aztec-packages` (the foundation; releases are cut here), **private** `aztec-packages-private` (same tree plus embargoed work; `public-next` mirrors public `next`; releases go only to the internal Artifact Registry), **labs** `aztec-labs-eng/aztec-node` (node, PXE/wallets, aztec-nr, docs, playground, spartan; consumes the foundation through published `@aztec-foundation/*` packages and bb/nargo release binaries).

The foundation builds labs from the `labs/` submodule against its own tree, so a foundation change is tested against labs before it ships. Foundation-side changes to labs are **patches** (`labs-patches/*.patch`) applied on top of the pinned submodule commit. One command drives all of it: `scripts/labs`.

## Build and test

```
./bootstrap.sh          # applies the labs series; labs/ HEAD sits above the gitlink and git ignores that
make fast               # foundation + labs against this tree
make fast-labs          # labs only: yarn-project (+tests, e2e), aztec-nr, noir-contracts, snapshots
make labs-full          # + docs, spartan, playground, claude tests, benches
scripts/labs run <cmd>  # any command inside labs/ with the right environment
```

Labs cache keys follow the foundation tree (`labs/labs-aztec-toolchain/fnd-hashes`, committed by the build as a marker commit); tests that only run from a labs checkout (compose/web3signer/ha e2e, playground browser tests, docs examples) are skipped here and belong to labs CI.

## Change labs from the foundation

```
scripts/labs apply                 # (already done by bootstrap) patched labs/ checkout
cd labs && <edit> && git commit    # the series re-exports itself on commit
git add labs-patches && git commit # the .patch files are what your PR carries
scripts/labs upstream 4 5          # local preview of how the patches land upstream
```

The `.patch` files are the handoff: the labs team drains them (`git am` from an aztec-node checkout); the foundation side never pushes to aztec-node. A patch that needs a foundation version bump waits for that release. When a patch lands upstream, the next `bump` drops it from the series. `scripts/labs status` shows unexported commits; `apply` never discards them (`LABS_PATCHES_FORCE=1` is the last resort).

## Port a whole PR to labs

```
scripts/labs port 24800            # a v5 PR in the in-tree layout, or a next PR that only changes labs-patches/*.patch
```

The diff must touch only the labs half (in-tree `yarn-project/`, `noir-projects/labs/`, `docs/`, `playground/`, `spartan/`, `aztec-up/`, `release-image/`, `labs-aztec-toolchain/`, or `labs-patches/*.patch`); anything else is refused with the files listed. It is replayed 3-way onto aztec-node `main` (already-landed hunks become no-ops); remaining conflicts are committed with markers and listed, foundation-path references flagged. v5 PRs get the `port-to-aztec-node` label automatically; a person with aztec-node write access runs this and pushes the result (`--push`) — the foundation side itself never pushes to aztec-node.

## Take labs changes in

```
scripts/labs bump main --pr        # move the pin, re-apply the series, commit gitlink + foundry locks + patches, open the PR
```

`bump` refuses on unexported work and lists the patches upstream absorbed. If a patch no longer applies: fix it in `labs/` (`git am --3way` conflicts), commit, and the series re-exports. Labs takes foundation changes through releases (`labs-aztec-toolchain` pins) and, immediately, through foundation CI building the submodule.

## Public ↔ private

- `public-next` (private repo) is a force-mirror of public `next`; a merge into private `next` follows. When that merge conflicts, AztecBot opens a raw-merge PR plus a resolution PR on top: land resolution into raw, raw into `next`.
- Prototype a private-only mechanism without private content: branch from `public-next`, cherry-pick the public PRs, open the PR **into `public-next`**, label `ci-release-pr`.
- Port private work to public by cherry-picking onto a public branch with `--author`; public → private is the mirror.
- `ci-release-pr` on any PR tags its head and runs the full release flow: public → real npm (trusted publishing, no tokens) / GitHub / crates prereleases at `0.0.1-commit.<sha>`; private → Artifact Registry only (`GCP_PRIVATE_NPM_DEPLOY`). The build log is attached to the run as the `ci-logs` artifact.

## If this happens

| Situation | Do |
|---|---|
| a bb/noir/circuit change must reach labs code | build, `make fast-labs` |
| `apply`: a patch does not apply | fix in `labs/`, commit (auto-export) |
| `apply`: commits would be lost | `scripts/labs export`, or `git -C labs reset`, or `LABS_PATCHES_FORCE=1` |
| CI red in a labs test | run the `/tmp/test_cmds` line from the root, or `scripts/labs run <cmd>` |
| labs tests say `disabled-cache` locally | by design; per-package hashes resolve in CI only |
| labs-only PR on a v5 line | `scripts/labs port <pr>` (someone with aztec-node access pushes) |
| the private `public-next → next` merge is stuck | land the AztecBot pair |
