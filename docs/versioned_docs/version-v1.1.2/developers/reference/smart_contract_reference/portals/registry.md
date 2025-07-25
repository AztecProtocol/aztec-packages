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
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/l1-contracts/src/governance/interfaces/IRegistry.sol#L27-L29" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/src/governance/interfaces/IRegistry.sol#L27-L29</a></sub></sup>


| Name        | Description                                    |
| ----------- | ---------------------------------------------- |
| ReturnValue | The number of versions that have been deployed |

## `getCanonicalRollup()`

Retrieves the current rollup contract.

```solidity title="registry_get_canonical_rollup" showLineNumbers 
function getCanonicalRollup() external view returns (IHaveVersion);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/l1-contracts/src/governance/interfaces/IRegistry.sol#L19-L21" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/src/governance/interfaces/IRegistry.sol#L19-L21</a></sub></sup>


| Name        | Description        |
| ----------- | ------------------ |
| ReturnValue | The current rollup |

## `getRollup(uint256 _version)`

Retrieves the rollup contract for a specfic version.

```solidity title="registry_get_rollup" showLineNumbers 
function getRollup(uint256 _chainId) external view returns (IHaveVersion);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.1.2/l1-contracts/src/governance/interfaces/IRegistry.sol#L23-L25" target="_blank" rel="noopener noreferrer">Source code: l1-contracts/src/governance/interfaces/IRegistry.sol#L23-L25</a></sub></sup>


| Name        | Description        |
| ----------- | ------------------ |
| ReturnValue | The current rollup |
