---
title: Contract inclusion
---

# prove_contract_inclusion
Proves that a contract exists at a specified block number and returns its address. It can be used to approximate a factory pattern, verifying that a contract at a given address matches expected constructor arguments.

## Arguments
| Argument Name           | Type           | Description                                       |
|-------------------------|----------------|---------------------------------------------------|
| deployer_public_key     | Point          | Public key of the deployer                        |
| contract_address_salt   | Field          | Salt used for the contract address                |
| function_tree_root      | Field          | Root of the function tree                         |
| constructor_hash        | Field          | Hash of the constructor                           |
| portal_contract_address | EthAddress     | Ethereum address of the portal contract           |
| block_number            | u32            | Block number to prove the contract's existence    |
| context                 | PrivateContext | Context for executing the proof                   |

## Returns
| Return Name      | Type         |
|------------------|--------------|
|                  | AztecAddress |
