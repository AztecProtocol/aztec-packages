---
title: Registry
tags: [portals, contracts]
---

The registry is a contract deployed on L1, that contains addresses for the `Rollup`. It also keeps track of the different versions that have been deployed and let you query prior deployments easily.

**Links**: [Interface (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/governance/interfaces/IRegistry.sol), [Implementation (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/governance/Registry.sol).

## `numberOfVersions()`

Retrieves the number of versions that have been deployed.

```solidity title="registry_number_of_versions" showLineNumbers 
function numberOfVersions() external view returns (uint256);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/governance/interfaces/IRegistry.sol#L32-L34" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/src/governance/interfaces/IRegistry.sol#L32-L34</a></sub></sup>


| Name           | Description |
| -------------- | ----------- |
| ReturnValue    | The number of versions that have been deployed |

## `getRollup()`
Retrieves the current rollup contract.

```solidity title="registry_get_rollup" showLineNumbers 
function getRollup() external view returns (address);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/governance/interfaces/IRegistry.sol#L13-L15" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/src/governance/interfaces/IRegistry.sol#L13-L15</a></sub></sup>


| Name           | Description |
| -------------- | ----------- |
| ReturnValue    | The current rollup |

## `getVersionFor(address _rollup)`

Retrieve the version of a specific rollup contract.

```solidity title="registry_get_version_for" showLineNumbers 
function getVersionFor(address _rollup) external view returns (uint256);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/governance/interfaces/IRegistry.sol#L17-L19" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/src/governance/interfaces/IRegistry.sol#L17-L19</a></sub></sup>


| Name           | Description |
| -------------- | ----------- |
| `_rollup`      | The address of the rollup to lookup |
| ReturnValue    | The version number of `_rollup` |

#### Edge cases
Will revert with `Registry__RollupNotRegistered(_rollup)` if the rollup have not been registered.

## `getSnapshot(uint256 _version)`

Retrieve the snapshot of a specific version.

```solidity title="registry_snapshot" showLineNumbers 
/**
 * @notice Struct for storing address of cross communication components and the block number when it was updated
 * @param rollup - The address of the rollup contract
 * @param blockNumber - The block number of the snapshot
 */
struct RegistrySnapshot {
  address rollup;
  uint256 blockNumber;
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/governance/libraries/DataStructures.sol#L14-L24" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/src/governance/libraries/DataStructures.sol#L14-L24</a></sub></sup>

```solidity title="registry_get_snapshot" showLineNumbers 
function getSnapshot(uint256 _version)
  external
  view
  returns (DataStructures.RegistrySnapshot memory);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/governance/interfaces/IRegistry.sol#L21-L26" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/src/governance/interfaces/IRegistry.sol#L21-L26</a></sub></sup>


| Name           | Description |
| -------------- | ----------- |
| `_version`     | The version number to fetch data for |
| ReturnValue.rollup      | The address of the `rollup` for the `_version` |
| ReturnValue.blockNumber | The block number of the snapshot creation |


## `getCurrentSnapshot()`

Retrieves the snapshot for the current version.

```solidity title="registry_get_current_snapshot" showLineNumbers 
function getCurrentSnapshot() external view returns (DataStructures.RegistrySnapshot memory);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/master/l1-contracts/src/governance/interfaces/IRegistry.sol#L28-L30" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/src/governance/interfaces/IRegistry.sol#L28-L30</a></sub></sup>


| Name           | Description |
| -------------- | ----------- |
| ReturnValue.rollup      | The address of the `rollup` for the current `_version` |
| ReturnValue.blockNumber | The block number of the snapshot creation |

