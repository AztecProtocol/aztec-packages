## Eth Devnet

### Usage

```bash
./create.sh
```

## Args

Args can be supplied via environment variables.

### NUMBER_OF_KEYS

This determines the number of accounts that will be prefunded with eth on the execution layer.

### MNEMONIC

The seed phrase from which the keys will be derived.

### BLOCK_TIME

The time in seconds between blocks.

### GAS_LIMIT

The gas limit for the execution layer.

### CHAIN_ID

The chain id for the execution layer.

---

## Common Pitfalls

If you are struggling to get the network up and running, it is usually due to the genesis.json file having different values from the config.yaml + genesis.ssz file. Make sure that you do not edit any of them by accident after ./create.sh is run.
Note that this script places the configuration values within the /out folder, it will not actually run the testnet.

SSZ files are not passable thorugh config maps, so they must be base64 encoded, then decoded in the container before running.

Generating an Ethereum testnet requires a few ingredients:

## Genesis.json file

The genesis.json file configures the initial state of the execution layer, it defines what accounts are preloaded with what balances, what hardforks are active etc.
In this case the most important values to set are the deposit contract (ensuring that it is filled with empty state ( and an empty deposit tree )), and the allocation accounts we would like to have preloaded with funds.

## Config.yaml

The config.yaml file is used to configure a beacon chain client. It configures what contract address the deposit contract should be read on, as well as configuring when hardforks should be activated.

## Genesis.ssz

This file contains the state of the beacon chain at the genesis block, and it is used to bootstrap the network, such as the validator registry at the time of genesis, the deposit root from eth1 at the time of genesis etc.

## Other files

### Jwt secret

The jwt secret is used to authenticate the beacon chain client to the execution layer.
The execution api ports should not be exposed to the open internet.
