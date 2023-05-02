# L1 Contracts

This directory contains the Ethereum smart contract that we will be using for progressing the state of the Rollup.

## Installation
You can install foundry as https://book.getfoundry.sh/ or by running the `./bootstrap.sh` script.

Alternatively you can use docker instead, it will handle installations and run tests. Simply run `docker build .` from the `l1-contracts` folder.

## Structure
The `src` folder contain contracts that is to be used by the local developer testnet. It is grouped into 3 catagories:
- `core` containing the required contracts, the bare minimum
- `mock` things that are faking it, for now a verifier that says yes to anything but follows the correct interface.
- `periphery` stuff that is nice to have, convenience contracts and functions belongs in here.

## Running tests
The tests are located in the `test` folder, and execute two consecutive L2Blocks. The blocks and the values they are checked against is generated using the block builder tests (there also is a typescript test in `l2-block-publisher.test.ts` that tests E2E). The tests are currently limited in functionality as it is mainly decoding happening, but will expand over time to include L1 <-> L2 communication and cross chain applications.

As mentioned earlier, you can also use docker. If you rerun `docker build .` after changing the contracts, it will use a cache for most values, and rerun your tests in a few seconds.

## Formatting
We use `forge fmt` to format. But follow a few general guidelines beyond the standard:
- use `_` prefix for function arguments, e.g.,
  - Don't `function transfer(address to, uint256 amount);`
  - Do `function transfer(address _to, uint256 _amount);`
- use `_` prefix for `internal` and `private` functions.

## Contracts:

The contracts are in a very early stage, and don't bother with gas costs right now. Instead they prioritize velocity of development.

### Decoder
Job: Extract values from `L2Block` 

The decoder is a contract that is part of the Rollup, which takes the `L2Block` bytes and computes/extracts values that is required to keep track of the state and passed into the verifier.

If the structure of the `L2Block` changes, so should the decoder!

### Rollup
Job: Keep track of state and perform state transitions.

It is the job of the rollup contract to store the state of the rollup and progress it when receiving a new L2 block that is built on top of the current state. 

Currently not running any proofs *nor* access control so blocks can be submitted by anyone and can be complete garbage. 

### UnverifiedDataEmitter
Job: Share unverified data on chain.

For now, this include bytecode for contract deployment, but over time this will be verified for public functions.
