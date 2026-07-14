# `infra` e2e test category

Infrastructure tests cover deployment, network targeting, and ops scenarios that are not about a
single protocol behavior. A test belongs here when its primary concern is network targeting or
operational smoke-testing rather than correctness of a specific consensus, block-building, or
proving behavior.

## Tests

| File | Contents |
|---|---|
| `public_testnet_transfer.test.ts` | Deploy and transfer on a public L1 network (Sepolia) or local Anvil, parameterized by `L1_CHAIN_ID`. With no `L1_CHAIN_ID` set the test targets local Anvil and runs in CI; with Sepolia credentials (`SEQ_PUBLISHER_PRIVATE_KEY`, `ETHEREUM_HOSTS`, `L1_CHAIN_ID=11155111`) it runs against the live public testnet. |
