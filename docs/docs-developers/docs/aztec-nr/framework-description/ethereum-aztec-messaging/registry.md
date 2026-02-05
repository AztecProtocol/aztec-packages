---
title: Registry
description: Learn about the portal registry and how it manages L1-L2 contract mappings.
tags: [portals, contracts]
references: ["l1-contracts/src/governance/interfaces/IRegistry.sol"]
---

The Registry is a contract deployed on L1 that tracks canonical and historical rollup instances. It allows you to query the current rollup contract and look up prior deployments by version.

**Links**: [Interface](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/l1-contracts/src/governance/interfaces/IRegistry.sol), [Implementation](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/l1-contracts/src/governance/Registry.sol).

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

Retrieves the rollup contract for a specific version.

#include_code registry_get_rollup l1-contracts/src/governance/interfaces/IRegistry.sol solidity

| Name        | Description                          |
| ----------- | ------------------------------------ |
| `_version`  | The version identifier of the rollup |
| ReturnValue | The rollup for the specified version |

## Other view functions

| Function                 | Returns              | Description                                      |
| ------------------------ | -------------------- | ------------------------------------------------ |
| `getVersion(uint256)`    | `uint256`            | Returns the version number stored at the given index in the historical versions list |
| `getGovernance()`        | `address`            | Returns the governance contract address (owner)  |
| `getRewardDistributor()` | `IRewardDistributor` | Returns the reward distributor contract          |

## Related pages

- [Inbox](./inbox.md) - L1 to L2 message passing
- [Outbox](./outbox.md) - L2 to L1 message passing
- [L1-L2 Communication (Portals)](./index.md) - Overview of cross-chain messaging
