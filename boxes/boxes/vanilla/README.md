# aztec-web-starter

This is an example web app that demonstrates how to interact with an Aztec contract using the Aztec JS SDK.

- Uses the [Private Voting](https://docs.aztec.network/developers/tutorials/codealong/contract_tutorials/private_voting_contract) example
- Includes an embedded wallet. This is only for demonstration purposes and not for production use.
- Works on top of the Sandbox, but can be adapted to work with a testnet.

### Setup

1. Install the Aztec tools from the first few steps in [Quick Start Guide](https://docs.aztec.network/developers/getting_started).

Please note that this project uses `latest` version of Aztec SDK. If you wish to use a different version, please update the dependencies in the `app/package.json` and in `contracts/Nargo.toml` file to match your version.

You can install a specific version of Aztec tools by running `aztec-up 0.X.X`


2. Compile smart contracts in `/contracts`:

```sh
yarn build-contracts
```

The build script compiles the contract and generates the artifacts.

3. Deploy the contracts

Run the JS deploy script to deploy the contracts (NodeJS v20.0):

```sh
yarn install
yarn deploy-contracts
```

The deploy script generates a random account and deploys the voting contract with it. It also uses the SponsoredFPC contract for fee payment. This is sufficient for testing with Sandbox, but is not suitable for production setup.

The script also writes the deployment info to `.env` (which our web-app reads from).

> Note that the script generates client proofs and it may take a couple of seconds. For faster development, you can disable proving by calling with `PROVER_ENABLED=false` (Sandbox accepts transactions without a valid proof).

4. Run the app (development mode):

```sh
yarn dev
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
# Install playwright browsers
yarn playwright install --with-deps

yarn test
```

<br />

## Disable client proofs

The Sandbox will accept transactions without a valid proof. You can disable proof generation when working against the Sandbox as it will save time during development.

To disable proving in the deploy script, run:

```sh
PXE_PROVER=none ./deploy.sh
```

To disable proving in the web app, you can set `PROVER_ENABLED` to `false` in `embedded-wallet.ts` file.
