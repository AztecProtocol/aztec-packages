# GAztec

Initial version of an "everything app" that can be used to test and benchmark Aztec.

  * PXE in the browser with client proofs
  * Connect to local sandbox or any network (scoped data)
  * Lazy loading of most assets (think contract artifacts) and WASM (bb still loads at start due to top-level await, but in parallel as it is separated from the main index,js)
  * Bundled by vite, 1MB compressed
  * Drop any contract artifact, interpret its ABI, simulate and send
  * Acts as a barebones wallet, managing auth scopes and separating accounts
  * Stores artifacts, accounts and all that's required to pick up where you left off without having to redeploy everything (indexeddb)
  * Supports basic aliasing of addresses
  * Allows loading an artifact, provide the address and go (instead of having to deploy it)
  * Add senders/contact management
  * Authwits

Missing:

  * Benchmarking window where simulation/proving stats are displayed

## To run

Dev:

```
yarn dev
```

Production:

```
yarn build
yarn preview
``````