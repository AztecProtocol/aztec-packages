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

After a stable release `X.Y.Z` is published to npm, run:

```bash
./add_version.sh X.Y.Z
```

and commit the resulting `X.Y.Z.tar.gz`. The script builds the tarball with deterministic tar/gzip
flags, so regenerating from the same npm packages yields a byte-identical file.
