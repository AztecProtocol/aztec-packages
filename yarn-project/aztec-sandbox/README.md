# aztec-sandbox

Aztec Sandbox is a package that allows for a simple development environment on Aztec stack. It creates an Aztec RPC server that listens for HTTP requests on `localhost:8080` by default. When started, it deploys all necessary L1 Aztec contracts and then starts listening for RPC requests.

## How to run:

### Docker Compose

The easiesty way to run is by using docker compose. This will create two containers:

1. The sandbox listening on port `8080`
2. A foundry instance listening on port `8545`

### Node Server

You can also run it as a standalone node server with:

```sh
yarn start
```

It will look for a local Ethereum RPC to talk to but you can change this with the `ETHEREUM_HOST` environment variable.

## Examples

The package also includes 2 examples:

- Deployment, mint and transfer on an Aztec ZK Token
  - `yarn run:example:token`
- An L1 / L2 uniswap token trade.
  - `yarn run:example:uniswap`
  - To run this example, you need to use the `docker-compose-fork.yml` configuration.

## Publishing

This package is set-up to be published on dockerhub by CI whenever there's a merge on `master` branch.
It's published under the tag `aztecprotocol/aztec-sandbox:master`.
