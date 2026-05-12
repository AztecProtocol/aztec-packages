# public_checks stamp

`derive_public_checks.test.ts` is the freshness gate: it re-derives the public_checks address and classId from the freshly-built artifact and asserts they match what is committed in:

- `noir-projects/aztec-nr/canonical_addresses/src/public_checks.nr` — `PUBLIC_CHECKS_ADDRESS` (Noir global, consumed by app contracts via `public_checks::utils`)
- `yarn-project/canonical-contracts/src/public-checks/address.gen.ts` — TS twin

If this test fails, it usually means `public_checks_contract` source or the Noir/bb toolchain changed. Regenerate the stamp from `yarn-project/`:

    yarn workspace @aztec/canonical-contracts run regen:public-checks-address

Then commit the resulting diffs in `public_checks.nr` and `address.gen.ts`.

(You need a built artifact at `noir-projects/noir-contracts/target/public_checks_contract-PublicChecks.json` — `./bootstrap.sh build` from the git root produces it.)
