# Contract instances

A contract instance is a concrete deployment of a [contract class](./classes.md). A contract instance has state, both private and public, as well as an address that acts as identifier, and can be called into. A contract instance always references a contract class, that dictates what code it executes when called.

## Structure

The structure of a contract instance is defined as:

| Field | Type | Description |
|----------|----------|----------|
| version | u8 | Version identifier. Initially one, bumped for any changes to the contract instance struct. |
| deployer_address | AztecAddress | Address of the canonical contract used for deploying this instance. |
| salt | Field | User-generated pseudorandom value for uniqueness. |
| contract_class_id | Field | Identifier of the contract class for this instance. |
| contract_args_hash | Field | Hash of the arguments to the constructor. |
| portal_contract_address | EthereumAddress | Optional address of the L1 portal contract. |
| public_keys | PublicKeys | Optional struct of public keys used for encryption and nullifying by this contract. |

<!-- TODO: Define the structure of public_keys -->

## Deployment

A new contract instance can be created by calling a private `deploy` function in a canonical `Deployer` contract. This function receives a `ContractInstance` struct as described above, and executes the following actions:

- Validates the referenced `contract_class_id` exists.
- Computes the resulting contract address from the hash of the contract instance.
- Emits the address in the `new_contract_instances` public inputs.
- Calls the constructor with the preimage of the supplied `contract_args_hash`.
- Emits an unencrypted event with the address and its preimage.

The kernel circuit validates that the contract emitting the `new_contract_instances` is the canonical `Deployer`, and emits those values so they can be added to the global contract instances tree. Upon seeing a new contract deployed event, nodes are expected to store the address and preimage.

<!-- 
TODO: Should deploy be private or public? Or both? 
TODO: Define how address is computed 
TODO: Define what info is emitted 
TODO: Define the format of the unencrypted event 
--> 
