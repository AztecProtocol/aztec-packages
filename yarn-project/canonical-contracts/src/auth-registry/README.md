# auth_registry stamp

`derive_auth_registry.test.ts` is the freshness gate: it re-derives the auth_registry address and classId from the freshly-built artifact and asserts they match what is committed in:

- `noir-projects/aztec-nr/canonical_addresses/src/lib.nr` — `AUTH_REGISTRY_ADDRESS` (Noir global)
- `yarn-project/canonical-contracts/src/auth-registry/address.gen.ts` — TS twin

If this test fails, it usually means `auth_registry_contract` source or the Noir/bb toolchain changed. Regenerate the stamp from `yarn-project/`:

    yarn workspace @aztec/canonical-contracts run regen:auth-registry-address

Then commit the resulting diffs in `lib.nr` and `address.gen.ts`.

(You need a built artifact at `noir-projects/noir-contracts/target/auth_registry_contract-AuthRegistry.json` — `./bootstrap.sh build` from the git root produces it.)
