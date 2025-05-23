---
title: Registry
tags: [portals, contracts]
---

The registry is a contract deployed on L1, that contains addresses for the `Rollup`. It also keeps track of the different versions that have been deployed and let you query prior deployments easily.

**Links**: [Interface (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/governance/interfaces/IRegistry.sol), [Implementation (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/governance/Registry.sol).

## `numberOfVersions()`

Retrieves the number of versions that have been deployed.

#include_code registry_number_of_versions l1-contracts/src/governance/interfaces/IRegistry.sol solidity

| Name        | Description                                    |
| ----------- | ---------------------------------------------- |
| ReturnValue | The number of versions that have been deployed |

## `getCanonicalRollup()`

Retrieves the current rollup contract.

#include_code registry_get_canonical_rollup l1-contracts/src/governance/interfaces/IRegistry.sol solidity

| Name        | Description        |
| ----------- | ------------------ |
| ReturnValue | The current rollup |

## `getRollup(uint256 _version)`

Retrieves the rollup contract for a specfic version.

#include_code registry_get_rollup l1-contracts/src/governance/interfaces/IRegistry.sol solidity

| Name        | Description        |
| ----------- | ------------------ |
| ReturnValue | The current rollup |
