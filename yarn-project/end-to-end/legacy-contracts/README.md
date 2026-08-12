# Legacy contract artifacts

One tarball per prior stable release of the current major, holding the contract artifact JSON of
`@aztec/noir-contracts.js`, `@aztec/noir-test-contracts.js`, and `@aztec/accounts` as published at
that version:

```
<version>.tar.gz
└── <version>/
    ├── noir-contracts.js/artifacts/*.json
    ├── noir-test-contracts.js/artifacts/*.json
    └── accounts/artifacts/*.json
```

These drive the backwards-compatibility sweep: `test_cmds` (in `../bootstrap.sh`) emits, for every
version present here, a run of the artifact-consuming e2e tests with `CONTRACT_ARTIFACTS_VERSION`
set, and the jest resolver (`../src/legacy-jest-resolver.cjs`) swaps artifact JSON imports to the
matching historical files, unpacked on demand into the gitignored `../.legacy-contracts/` cache by
`../src/install_legacy_contracts.cjs`. An empty directory (a line with no stable releases yet)
means no sweep — delete the tarballs to disable compat testing on a line, add one to extend it.

Every full CI run (`bootstrap.sh ci-full*` at the repo root) fails while any stable release of the
major is missing here, so the set can't silently fall behind. Releases themselves aren't gated:
the release cutting `X.Y.Z` is what publishes the packages the `X.Y.Z` artifacts are built from,
so they can't be vendored beforehand — the first full run after a stable release goes red until
the new tarball lands.

## Adding a version

After a stable release `X.Y.Z` is published to npm:

```bash
cd $(mktemp -d)
for p in noir-contracts.js noir-test-contracts.js accounts; do
  npm pack "@aztec/$p@X.Y.Z"
  mkdir -p "X.Y.Z/$p"
  tar -xzf aztec-$p-X.Y.Z.tgz
  cp -r package/artifacts "X.Y.Z/$p/artifacts" && rm -rf package
done
find X.Y.Z -type f ! -name '*.json' -delete
tar --sort=name --owner=0 --group=0 --numeric-owner --mtime='2000-01-01 00:00:00Z' \
    -cf - X.Y.Z | gzip -n -9 > X.Y.Z.tar.gz
```

Commit the resulting `X.Y.Z.tar.gz` in this directory. The tar/gzip flags make the output
deterministic, so regenerating from the same npm packages yields a byte-identical file.
