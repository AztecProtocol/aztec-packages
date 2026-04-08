# End to End

This package includes end-to-end tests that cover Aztec's main milestones.
These can be run locally either by starting anvil on a different terminal.

```
anvil -p 8545 --host 0.0.0.0 --chain-id 31337
```

and then running

```
yarn test
```

Or by running

```
yarn test:integration
```

which will spawn the two processes.

You can also run this by `docker-compose up` which will spawn 2 different containers for Anvil and the test runner.

You can run a single test by running `yarn test:compose <test_name>`.

## Running tests against legacy contract artifacts

To verify that contracts deployed from a previous release still work against the current stack, set
`CONTRACT_ARTIFACTS_VERSION` to a published version of `@aztec/noir-contracts.js` / `@aztec/noir-test-contracts.js`:

```
CONTRACT_ARTIFACTS_VERSION=4.1.3 yarn test:e2e src/e2e_amm.test.ts
```

The first run downloads the pinned packages into `.legacy-contracts/<version>/node_modules/` (cached across runs). A
startup banner and per-import trace are printed to stderr so you can confirm the legacy artifacts were actually loaded:

```
[legacy-contracts] CONTRACT_ARTIFACTS_VERSION=4.1.3
[legacy-contracts] redirecting @aztec/noir-contracts.js -> .legacy-contracts/4.1.3/...
[legacy-contracts] resolved @aztec/noir-contracts.js/Token -> /abs/path/.legacy-contracts/4.1.3/...
```

When `CONTRACT_ARTIFACTS_VERSION` is unset the test run is byte-identical to the default behaviour. The cache is
populated automatically on first use.
