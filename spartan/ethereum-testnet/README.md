## Ethereum Testnet

This directory contains scripts to install a local Ethereum testnet using Kurtosis.

To install:
```bash
./install_kurtosis.sh
```

To deploy the testnet:
```bash
export ENCLAVE_NAME=ethereum-testnet # defaults to this
./deploy.sh
```
This will deploy a testnet with into the namespace `kt-{ENCLAVE_NAME}`. Defaults to `kt-ethereum-testnet`.

To destroy the testnet:
```bash
./teardown.sh
```
