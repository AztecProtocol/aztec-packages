# Aztec Playground

Initial version of an "everything app" that can be used to test and benchmark Aztec.

- Embedded wallet with PXE in the browser and client proofs
- Connect to local sandbox or any network (scoped data)
- Lazy loading of most assets (think contract artifacts) and WASM
- Bundled by vite, 1.6MB compressed
- Drop any contract artifact, interpret its ABI, simulate and send
- Stores artifacts, accounts and all that's required to pick up where you left off without having to redeploy everything (indexeddb)
- Supports aliasing of addresses, senders, contracts, etc
- Allows loading an artifact, provide the address and go (instead of having to deploy it)
- Add senders/contact management
- Authwits
- Benchmarking window where simulation/proving stats are displayed

## To run

Dev:

```
yarn dev
```

Production:

```
yarn build
yarn preview
```
