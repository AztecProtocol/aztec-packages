# aztec-web-starter

This is an example web app that demonstrates how to interact with an Aztec contract using the Aztec JS SDK.

- Uses the [Private Voting](https://docs.aztec.network/developers/tutorials/codealong/contract_tutorials/private_voting_contract) example
- Includes an embedded wallet. This is only for demonstration purposes and not for production use.
- Works on top of the Sandbox, but can be adapted to work with a testnet.

### Setup

1. Install the Aztec tools from the first few steps in [Quick Start Guide](https://docs.aztec.network/developers/getting_started).

Please note that this project uses `0.87.2` version of Aztec SDK. If you wish to use a different version, please update the dependencies in the `app/package.json` and in `contracts/Nargo.toml` file to match your version.

Alternatively, you can install `0.87.2` version of Aztec tools by running the below commands:

```sh
aztec-up 0.87.2
aztec start --sandbox
```

2. Compile smart contracts in `/contracts`:

```sh
(cd contracts && ./build.sh)
```

The build script compiles the contract and generates the artifacts.

3. Deploy the contracts

Run the JS deploy script to deploy the contracts (NodeJS v20.0):

```sh
(cd app && yarn install)
(cd app && yarn deploy-contracts)
```

This will deploy the contracts and save the deployment info to `app/deployed-contract.json`.
The full process involves `Generating Client IVC proof`, and may take a few moments. For faster development the sandbox does not verify proofs, so this can optionally be disabled [here](#disable-client-proofs). 

> Important: For a production app, you need to back up the deployment info file to a secure location as without it, you will not be able to recover the contract address.

4. Run the app:

```sh
(cd app && yarn dev)
```

### Test the app

You can now interact with the deployed contract using the web app:

- Create a new account
  - Like before, this will take some time to generate proofs (especially the first time as it needs to download a ~67MB proving key)
  - Note: this will save your account keys to your browser's local storage
- Cast a vote for one of the 5 candidates
- Voting again should throw an error
- Open another browser (or an incognito window), create a new account, and cast a vote
- See the updated vote results in the first browser

You can also run the E2E tests:

```sh
(cd app && yarn test)
```

<br />

## Disable client proofs

The Sandbox will accept transactions without a valid proof. You can disable proof generation when working against the Sandbox as it will save time during development.

To disable proving in the deploy script, run:

```sh
PXE_PROVER=none ./deploy.sh
```

To disable proving in the web app, you can add the following line in `app/src/embedded-wallet.ts` (uncomment the existing line):

```ts
config.proverEnabled = false;
```
