# Chapter 2a: Protocol Contracts

Protocol contracts are special contracts built into the Aztec protocol.
They have fixed "magic" addresses and provide core functionality like
contract deployment, fee payments, and authentication.

## What Are Protocol Contracts?

Unlike regular user-deployed contracts, protocol contracts:

1. Have **canonical addresses** (1, 2, 3, ... up to 11)
2. Are **always available** - no deployment transaction needed
3. Provide **core protocol functionality**
4. Cannot be **upgraded** through normal means

## The Magic Address System

Protocol contracts use a two-address system:

```
Magic Address (1-11)         Derived Address
+------------------+         +------------------+
| e.g., address 5  |  maps   | actual contract  |
| (FeeJuice)       |  --->   | address with     |
|                  |         | code and state   |
+------------------+         +------------------+
```

**Why two addresses?**

- **Magic address**: Simple, memorable (1, 2, 3...)
- **Derived address**: Contains actual contract class ID, salt, keys

Users call the magic address. The kernel transparently maps it to the
derived address where the code lives.

## Protocol Contract List

| Magic | Name | Purpose |
|-------|------|---------|
| 1 | AuthRegistry | Authorization witness registry |
| 2 | InstanceRegistry | Contract instance registration |
| 3 | ClassRegistry | Contract class registration |
| 4 | MultiCallEntrypoint | Batched call support |
| 5 | FeeJuice | Native fee token |
| 6 | PublicChecks | Public execution checks |

### AuthRegistry (Address 1)

Stores authorization witnesses for account abstraction.
Allows contracts to verify that actions were authorized.

### ContractInstanceRegistry (Address 2)

Registers deployed contract instances. When you deploy a contract:

1. Your deployment transaction calls InstanceRegistry
2. Registry stores: address -> (class_id, salt, keys)
3. Future calls can verify the contract exists

Also handles **contract upgrades** by storing updated class IDs.

### ContractClassRegistry (Address 3)

Registers contract classes (the "code" without instance data):

1. Stores: class_id -> (artifact_hash, functions_root, bytecode)
2. Enables code reuse across multiple instances
3. Required for public function execution

### MultiCallEntrypoint (Address 4)

Enables batching multiple calls in a single transaction:

```
User -> MultiCallEntrypoint -> [Call1, Call2, Call3]
```

Useful for account abstraction and complex operations.

### FeeJuice (Address 5)

The native token for paying transaction fees:

- **Setup phase**: `FeeJuice.approve(sequencer, max_fee)`
- **Teardown phase**: `FeeJuice.payFee(sequencer, actual_fee)`
- Balance stored in public data tree
- TX Base circuit directly reads/updates balances

### PublicChecks (Address 6)

Provides utilities for public execution validation.

## The ProtocolContracts Struct

The kernel receives protocol contract info in this struct:

```rust
pub struct ProtocolContracts {
    // Maps magic address i to derived_addresses[i-1]
    derived_addresses: [AztecAddress; MAX_PROTOCOL_CONTRACTS],
}
```

Key methods:

```rust
impl ProtocolContracts {
    // Check if address is 1-11
    pub fn is_magic_protocol_contract_address(
        contract_address: AztecAddress
    ) -> bool {
        // Uses polynomial evaluation for efficiency:
        // (x-1)(x-2)...(x-11) == 0 iff x in {1..11}
        let mut acc = 1;
        for i in 1..MAX_PROTOCOL_CONTRACTS + 1 {
            acc *= (contract_address.to_field() - i as Field);
        }
        acc == 0
    }
    
    // Get actual address for magic address
    pub fn get_derived_address(
        self,
        magic_address: AztecAddress
    ) -> AztecAddress {
        // Magic address i maps to derived_addresses[i-1]
        self.derived_addresses[magic_address.to_field() as u32 - 1]
    }
}
```

## Contract Address Validation

The kernel validates every private call to ensure the executed
function belongs to the correct contract. The flow differs based on
contract type:

```
                     Is it a magic address (1-11)?
                              |
              +---------------+---------------+
              |                               |
             Yes                              No
              |                               |
    Get derived address              Is it upgraded?
    Verify function in class         (Check InstanceRegistry)
              |                               |
              |               +---------------+---------------+
              |               |                               |
              |              Yes                              No
              |               |                               |
              |     Verify function            Verify function
              |     in UPDATED class           in original class
              |               |                               |
              +---------------+---------------+---------------+
                              |
                         Call is valid
```

### Validation Code

```rust
pub fn validate_contract_address(
    private_call_data: PrivateCallData,
    protocol_contracts: ProtocolContracts,
) {
    let contract_address = private_call_data
        .public_inputs.call_context.contract_address;
    
    // Step 1: Compute class ID from the function being called
    let private_functions_root = private_functions_root_from_siblings(
        function_selector,
        vk_hash,
        hints.function_leaf_membership_witness,
    );
    
    let computed_class_id = ContractClassId::compute(
        hints.contract_class_artifact_hash,
        private_functions_root,
        hints.contract_class_public_bytecode_commitment,
    );
    
    let computed_address = AztecAddress::compute_from_class_id(
        computed_class_id,
        hints.salted_initialization_hash,
        hints.public_keys,
    );
    
    // Step 2: Check if protocol contract
    let is_protocol = ProtocolContracts
        ::is_magic_protocol_contract_address(contract_address);
    
    // Disallow calling derived addresses directly
    protocol_contracts
        .assert_not_derived_protocol_contract_address(contract_address);
    
    if is_protocol {
        // Verify computed address matches derived address
        let derived = protocol_contracts.get_derived_address(contract_address);
        assert(computed_address == derived);
    }
    
    // Step 3: Check if upgraded contract
    let updated_class_id = get_updated_contract_class_id(...);
    
    if !updated_class_id.is_empty() {
        assert(computed_class_id == updated_class_id);
    }
    
    // Step 4: Regular contract
    if !is_protocol && updated_class_id.is_empty() {
        assert(computed_address == contract_address);
    }
}
```

## Why Derived Addresses Are Blocked

Users cannot call derived protocol addresses directly:

```rust
protocol_contracts
    .assert_not_derived_protocol_contract_address(contract_address);
```

**Reason**: State is siloed by contract address. If you called
the derived address directly:

- State would be siloed with the **derived** address
- Different from state siloed with the **magic** address
- Would create two separate, incompatible states

By blocking derived address calls, all state consistently uses
the magic address for siloing.

## Protocol Contracts and Upgrades

Protocol contracts **cannot be upgraded**:

```rust
// From validate_contract_address:
// In the (expected-to-be-impossible) event that someone manages
// to update a protocol contract entry in the registry (through
// some bug exploit), we would prefer for that updated class_id
// to be ignored.
```

The validation ensures:
1. Protocol contract check happens **before** upgrade check
2. If magic address, use derived address's class (ignore any update)
3. Only non-protocol contracts can be upgraded

## Public Function Execution

For public functions, derived addresses are also blocked through
a different mechanism:

1. Public functions require registration in InstanceRegistry
2. Only the contract's **deployer** can register it
3. Derived protocol contracts set their deployer to the magic address
4. No one can impersonate magic address 2 (for example)
5. Therefore, no one can register derived protocol contracts
6. AVM cannot execute unregistered public functions

## Fee Payment Flow

FeeJuice demonstrates protocol contract interaction:

```
1. Private Phase (user's device):
   User -> FeeJuice.approve(sequencer, max_fee)
   
2. Public Setup (sequencer):
   [Approval verified]
   
3. Public App Logic:
   [User's public calls execute]
   
4. Public Teardown:
   FeeJuice.payFee(sequencer, actual_fee)
   
5. TX Base Circuit:
   [Directly deducts from fee_payer's balance]
```

The TX Base circuit is unique in that it directly modifies
FeeJuice state without going through the contract:

```rust
// TX Base performs direct state update:
// 1. Read fee_payer's FeeJuice balance from public data tree
// 2. Deduct transaction_fee
// 3. Write updated balance back
```

This is necessary because fee collection must happen **after**
all user code has executed, including teardown.

## Security Considerations

### For Auditors

1. **Magic address validation**: Verify polynomial check is correct
2. **Derived address blocking**: Ensure both private and public paths blocked
3. **Upgrade immunity**: Confirm protocol contracts ignore updates
4. **Fee deduction**: TX Base must correctly handle edge cases

### Common Vulnerabilities

| Issue | Impact | Mitigation |
|-------|--------|------------|
| Derived address callable | State isolation bypass | assert_not_derived check |
| Protocol upgrade | Code takeover | Checked before upgrade path |
| Fee underflow | Free transactions | Balance validation |

## Summary

| Concept | Description |
|---------|-------------|
| Magic address | Canonical addresses 1-11 |
| Derived address | Actual contract with code |
| ProtocolContracts | Struct mapping magic -> derived |
| Validation flow | Protocol -> Upgraded -> Regular |
| Blocking derived | Prevents state isolation issues |

Protocol contracts provide the foundation for Aztec's core
functionality while maintaining the same security guarantees
as user contracts through careful kernel validation.

\newpage
