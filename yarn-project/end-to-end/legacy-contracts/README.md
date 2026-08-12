# Legacy contract artifacts

Each tarball, holds the contract artifact JSON's of
`@aztec/noir-contracts.js`, `@aztec/noir-test-contracts.js`, and `@aztec/accounts` as published at
a specific version:

```
<version>.tar.gz
└── <version>/
    ├── noir-contracts.js/artifacts/*.json
    ├── noir-test-contracts.js/artifacts/*.json
    └── accounts/artifacts/*.json
```

These artifacts are used to test for backwards-compatibility during CI. 

## Adding a version


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
