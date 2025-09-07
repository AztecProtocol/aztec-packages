---
title: "Cross-Contract Communication"
description: "Building composable systems where multiple contracts work together while maintaining privacy."
sidebar_position: 2
tags: [cross-contract, composability, contract-calls, privacy-preserving]
---

# Cross-Contract Communication

## Building Composable Privacy Systems

One of Aztec's powerful features is the ability for contracts to call other contracts while maintaining privacy. This enables building complex, composable systems where multiple contracts work together without compromising user privacy.

## Understanding Contract Calls in Aztec

### Private Contract Calls

When a private function calls another private function (in the same or different contract), the call happens within the same execution context on the user's device (PXE).

```rust
// Contract A calling Contract B privately  
#[private]
fn use_external_contract(external_contract: AztecAddress, amount: Field) {
    let external = ExternalContract::at(external_contract);
    
    // This call happens in the same private execution context
    external.process_private_data(amount).call(&mut context);
}
```

### Public Contract Calls

Public functions can call other public functions, and these calls execute on the network.

```rust
#[public]
fn use_external_public(external_contract: AztecAddress, amount: Field) {
    let external = ExternalContract::at(external_contract);
    
    // This call happens on the network during public execution
    external.process_public_data(amount).call(&mut context);
}
```

### Hybrid Calls: Private → Public

Private functions can enqueue public function calls to execute after private execution completes.

```rust
#[private]
fn hybrid_operation(external_contract: AztecAddress, amount: Field) {
    // Private operations first
    let processed_amount = do_private_processing(amount);
    
    // Enqueue public call to external contract
    let external = ExternalContract::at(external_contract);
    external.public_settlement(processed_amount).enqueue(&mut context);
}
```

## Practical Example: Private DEX

Let's build a **Private Decentralized Exchange** that demonstrates cross-contract patterns:

### Token Contract (Dependency)

```rust
#[aztec]
contract PrivateToken {
    use dep::aztec::prelude::*;
    use dep::value_note::{utils, value_note::ValueNote};

    #[storage]
    struct Storage {
        balances: Map<AztecAddress, PrivateSet<ValueNote>>,
        name: PublicImmutable<Field>,
    }

    #[public]
    fn constructor(name: Field) {
        storage.name.initialize(name);
    }

    #[private]
    fn mint(to: AztecAddress, amount: Field) {
        storage.balances.at(to).insert(ValueNote::new(amount, to));
    }

    #[private]
    fn transfer(from: AztecAddress, to: AztecAddress, amount: Field) {
        // Authorization check (simplified)
        if from != context.msg_sender() {
            // In reality, would check AuthWit here
            assert(false); // Simplified for this example
        }

        // Execute transfer
        let from_notes = storage.balances.at(from).pop_notes(amount);
        let total = from_notes.fold(0, |sum, note| sum + note.value);
        assert(total >= amount);

        storage.balances.at(to).insert(ValueNote::new(amount, to));
        
        if total > amount {
            storage.balances.at(from).insert(ValueNote::new(total - amount, from));
        }
    }

    #[private]
    fn balance_of(owner: AztecAddress) -> Field {
        assert(owner == context.msg_sender());
        storage.balances.at(owner).get_notes(GetNotesOptions::new()).fold(0, |sum, note| sum + note.value)
    }

    // Allow external contracts to transfer tokens on behalf of users
    #[private]
    fn transfer_from_contract(from: AztecAddress, to: AztecAddress, amount: Field) {
        // This function is called by other contracts (like the DEX)
        // In production, would verify the calling contract is authorized
        
        let from_notes = storage.balances.at(from).pop_notes(amount);
        let total = from_notes.fold(0, |sum, note| sum + note.value);
        assert(total >= amount);

        storage.balances.at(to).insert(ValueNote::new(amount, to));
        
        if total > amount {
            storage.balances.at(from).insert(ValueNote::new(total - amount, from));
        }
    }
}
```

### DEX Contract (Main Contract)

```rust
#[aztec]
contract PrivateDEX {
    use dep::aztec::prelude::*;
    use dep::value_note::{utils, value_note::ValueNote};

    #[storage]
    struct Storage {
        // Private orders (only order creator can see details)
        orders: Map<AztecAddress, PrivateSet<ValueNote>>, // order_id -> order_data
        
        // Public trading pair info
        supported_pairs: Map<Field, PublicMutable<Field>>, // pair_hash -> enabled (0/1)
        
        // Public volume statistics (privacy-preserving)
        total_volume: PublicMutable<Field>,
        total_trades: PublicMutable<Field>,
    }

    #[public]
    fn add_trading_pair(token_a: AztecAddress, token_b: AztecAddress) {
        // Only admin can add pairs (simplified)
        let pair_hash = pedersen_hash([token_a.to_field(), token_b.to_field()]);
        storage.supported_pairs.at(pair_hash).write(1);
    }

    #[private]
    fn create_order(
        trader: AztecAddress,
        sell_token: AztecAddress,
        buy_token: AztecAddress, 
        sell_amount: Field,
        buy_amount: Field,
        order_id: Field
    ) {
        assert(trader == context.msg_sender());
        
        // Verify trading pair is supported (read public state)
        let pair_hash = pedersen_hash([sell_token.to_field(), buy_token.to_field()]);
        let pair_enabled = storage.supported_pairs.at(pair_hash).read();
        assert(pair_enabled == 1);

        // Transfer tokens from trader to DEX (cross-contract call)
        let sell_token_contract = PrivateToken::at(sell_token);
        sell_token_contract.transfer_from_contract(
            trader, 
            context.this_address(), 
            sell_amount
        ).call(&mut context);

        // Store private order details
        let order_data = encode_order(sell_token, buy_token, sell_amount, buy_amount);
        storage.orders.at(trader).insert(ValueNote::new(order_data, trader));

        // Update public statistics (enqueue public call)
        PrivateDEX::at(context.this_address())._update_order_stats().enqueue(&mut context);
    }

    #[private]
    fn fill_order(
        order_creator: AztecAddress,
        order_id: Field,
        filler: AztecAddress,
        sell_token: AztecAddress,
        buy_token: AztecAddress,
        sell_amount: Field,
        buy_amount: Field
    ) {
        assert(filler == context.msg_sender());

        // Verify order exists and get order details
        // (In production, would need more sophisticated order matching)
        
        // Transfer buy_token from filler to order_creator (cross-contract)
        let buy_token_contract = PrivateToken::at(buy_token);
        buy_token_contract.transfer_from_contract(
            filler,
            order_creator, 
            buy_amount
        ).call(&mut context);

        // Transfer sell_token from DEX to filler
        let sell_token_contract = PrivateToken::at(sell_token);
        sell_token_contract.transfer_from_contract(
            context.this_address(),
            filler,
            sell_amount  
        ).call(&mut context);

        // Remove the filled order
        // (Implementation would find and nullify the specific order note)

        // Update public statistics
        PrivateDEX::at(context.this_address())._update_trade_stats(sell_amount).enqueue(&mut context);
    }

    #[public]
    internal fn _update_order_stats() {
        let current_orders = storage.total_trades.read(); // Using as order count
        storage.total_trades.write(current_orders + 1);
    }

    #[public] 
    internal fn _update_trade_stats(volume: Field) {
        let current_volume = storage.total_volume.read();
        let current_trades = storage.total_trades.read();
        
        storage.total_volume.write(current_volume + volume);
        storage.total_trades.write(current_trades + 1);
    }

    // Public functions for statistics
    #[public]
    fn get_volume_stats() -> (Field, Field) {
        (storage.total_volume.read(), storage.total_trades.read())
    }

    // Helper function
    fn encode_order(sell_token: AztecAddress, buy_token: AztecAddress, sell_amt: Field, buy_amt: Field) -> Field {
        pedersen_hash([sell_token.to_field(), buy_token.to_field(), sell_amt, buy_amt])
    }
}
```

## Cross-Contract Authorization Patterns

### Pattern 1: Contract Allowances

```rust
#[aztec]
contract TokenWithContractAllowances {
    use dep::aztec::prelude::*;
    use dep::value_note::{utils, value_note::ValueNote};

    #[storage]
    struct Storage {
        balances: Map<AztecAddress, PrivateSet<ValueNote>>,
        contract_allowances: Map<Field, PrivateMutable<ValueNote>>, // hash(user,contract) -> amount
    }

    #[private]
    fn approve_contract(user: AztecAddress, contract_addr: AztecAddress, amount: Field) {
        assert(user == context.msg_sender());
        
        let allowance_key = pedersen_hash([user.to_field(), contract_addr.to_field()]);
        storage.contract_allowances.at(allowance_key).replace(ValueNote::new(amount, user));
    }

    #[private]
    fn transfer_from_approved_contract(from: AztecAddress, to: AztecAddress, amount: Field) {
        let calling_contract = context.msg_sender();
        let allowance_key = pedersen_hash([from.to_field(), calling_contract.to_field()]);
        
        // Check contract is authorized
        assert(storage.contract_allowances.at(allowance_key).is_initialized());
        let allowed_amount = storage.contract_allowances.at(allowance_key).get_note().value;
        assert(allowed_amount >= amount);

        // Reduce allowance
        storage.contract_allowances.at(allowance_key).replace(
            ValueNote::new(allowed_amount - amount, from)
        );

        // Execute transfer
        let from_notes = storage.balances.at(from).pop_notes(amount);
        let total = from_notes.fold(0, |sum, note| sum + note.value);
        assert(total >= amount);

        storage.balances.at(to).insert(ValueNote::new(amount, to));
        
        if total > amount {
            storage.balances.at(from).insert(ValueNote::new(total - amount, from));
        }
    }
}
```

### Pattern 2: Trusted Contract Registry

```rust
#[aztec]  
contract TrustedContractSystem {
    use dep::aztec::prelude::*;

    #[storage]
    struct Storage {
        trusted_contracts: Map<AztecAddress, PublicMutable<Field>>, // contract -> trust_level
        admin: PublicImmutable<AztecAddress>,
    }

    #[public]
    fn constructor(admin: AztecAddress) {
        storage.admin.initialize(admin);
    }

    #[public]
    fn add_trusted_contract(contract_addr: AztecAddress, trust_level: Field) {
        assert(context.msg_sender() == storage.admin.read());
        storage.trusted_contracts.at(contract_addr).write(trust_level);
    }

    #[private]
    fn call_trusted_contract(contract_addr: AztecAddress, data: Field) {
        // Check if contract is trusted (read public state)
        let trust_level = storage.trusted_contracts.at(contract_addr).read();
        assert(trust_level > 0);

        // Make call to trusted contract
        let external_contract = ExternalContract::at(contract_addr);
        external_contract.trusted_function(data).call(&mut context);
    }
}
```

## Advanced Cross-Contract Patterns

### Pattern 3: Privacy-Preserving Oracle Integration

```rust
#[aztec]
contract PrivateOracle {
    use dep::aztec::prelude::*;
    use dep::value_note::{utils, value_note::ValueNote};

    #[storage]
    struct Storage {
        price_feeds: Map<Field, PublicMutable<Field>>, // asset_id -> price
        private_requests: Map<AztecAddress, PrivateSet<ValueNote>>, // user -> requests
    }

    // Public price updates (from oracle operators)
    #[public]
    fn update_price(asset_id: Field, price: Field) {
        // In production, would verify oracle authorization
        storage.price_feeds.at(asset_id).write(price);
    }

    // Private price queries
    #[private]
    fn request_price_privately(user: AztecAddress, asset_id: Field, callback_contract: AztecAddress) {
        assert(user == context.msg_sender());
        
        // Get current price (read public state)
        let current_price = storage.price_feeds.at(asset_id).read();
        
        // Store private request
        let request_data = pedersen_hash([asset_id, callback_contract.to_field()]);
        storage.private_requests.at(user).insert(ValueNote::new(request_data, user));

        // Call back to requesting contract with price data
        let callback = ExternalContract::at(callback_contract);
        callback.receive_price_data(asset_id, current_price).call(&mut context);
    }
}

#[aztec]
contract PrivateTradingContract {
    use dep::aztec::prelude::*;

    #[private]
    fn execute_trade_with_oracle(oracle_addr: AztecAddress, asset_id: Field) {
        // Request price data from oracle
        let oracle = PrivateOracle::at(oracle_addr);
        oracle.request_price_privately(
            context.msg_sender(),
            asset_id, 
            context.this_address()
        ).call(&mut context);
    }

    #[private]
    fn receive_price_data(asset_id: Field, price: Field) {
        // This function is called back by the oracle
        // Execute trading logic based on received price
        execute_trade_logic(asset_id, price);
    }

    fn execute_trade_logic(asset_id: Field, price: Field) {
        // Trading logic implementation
    }
}
```

### Pattern 4: Contract Factory Pattern

```rust
#[aztec]
contract PrivateTokenFactory {
    use dep::aztec::prelude::*;

    #[storage]
    struct Storage {
        created_tokens: Map<AztecAddress, PublicMutable<Field>>, // token -> creator
        token_registry: Map<Field, PublicMutable<AztecAddress>>, // index -> token_address
        token_count: PublicMutable<Field>,
    }

    #[public]
    fn create_token(creator: AztecAddress, token_name: Field) -> AztecAddress {
        // Deploy new token contract
        let new_token = PrivateToken::deploy(token_name).send().deployed();
        let token_address = new_token.address;

        // Register the new token
        let current_count = storage.token_count.read();
        storage.created_tokens.at(token_address).write(creator.to_field());
        storage.token_registry.at(current_count).write(token_address);
        storage.token_count.write(current_count + 1);

        // Initialize the token through cross-contract call
        new_token.initialize(creator, 1000000).call(); // Mint initial supply

        token_address
    }

    #[public]
    fn get_token_info(index: Field) -> (AztecAddress, Field) {
        let token_address = storage.token_registry.at(index).read();
        let creator = storage.created_tokens.at(token_address).read();
        (token_address, creator)
    }
}
```

## Testing Cross-Contract Systems

```typescript
describe('Cross-Contract Communication', () => {
  let tokenA: PrivateTokenContract;
  let tokenB: PrivateTokenContract; 
  let dex: PrivateDEXContract;
  let alice: Wallet;
  let bob: Wallet;

  beforeAll(async () => {
    // Deploy contracts
    tokenA = await PrivateTokenContract.deploy(wallet, "TokenA").send().deployed();
    tokenB = await PrivateTokenContract.deploy(wallet, "TokenB").send().deployed();  
    dex = await PrivateDEXContract.deploy(wallet).send().deployed();

    // Setup trading pair
    await dex.methods.add_trading_pair(tokenA.address, tokenB.address).send().wait();

    // Mint tokens for testing
    await tokenA.methods.mint(alice.address, 1000n).send().wait();
    await tokenB.methods.mint(bob.address, 2000n).send().wait();
  });

  test('cross-contract token transfer in DEX', async () => {
    // Alice creates an order to sell TokenA for TokenB
    await dex.methods.create_order(
      alice.address,
      tokenA.address, // sell TokenA
      tokenB.address, // for TokenB  
      100n, // sell amount
      200n, // buy amount
      1n    // order ID
    ).send({ from: alice }).wait();

    // Verify DEX received Alice's tokens
    const dexBalanceA = await tokenA.methods
      .balance_of(dex.address)
      .simulate({ from: dex }); // DEX checking its own balance

    expect(dexBalanceA).toBe(100n);

    // Bob fills the order
    await dex.methods.fill_order(
      alice.address,
      1n, // order ID
      bob.address,
      tokenA.address,
      tokenB.address, 
      100n, // sell amount (TokenA)
      200n  // buy amount (TokenB)
    ).send({ from: bob }).wait();

    // Verify final balances
    const aliceBalanceB = await tokenB.methods
      .balance_of(alice.address) 
      .simulate({ from: alice });
    
    const bobBalanceA = await tokenA.methods
      .balance_of(bob.address)
      .simulate({ from: bob });

    expect(aliceBalanceB).toBe(200n); // Alice got TokenB
    expect(bobBalanceA).toBe(100n);   // Bob got TokenA
  });

  test('public statistics updated privately', async () => {
    const [volume, trades] = await dex.methods.get_volume_stats().simulate();
    
    expect(trades).toBeGreaterThan(0n); // Orders and trades were created
    expect(volume).toBeGreaterThan(0n); // Volume was recorded
  });
});
```

## Cross-Contract Best Practices

### 1. Verify Contract Authorization
```rust
// ✅ Good - verify caller is authorized
#[private]
fn restricted_function() {
    let caller = context.msg_sender();
    assert(is_authorized_contract(caller));
}

// ❌ Avoid - no authorization check
#[private] 
fn unrestricted_function() {
    // Any contract can call this
}
```

### 2. Handle Cross-Contract Failures
```rust
// ✅ Good - graceful error handling
#[private]
fn safe_cross_contract_call(external_addr: AztecAddress, amount: Field) {
    let external = ExternalContract::at(external_addr);
    
    // Could add try/catch logic or validation
    let success = external.process_payment(amount).call(&mut context);
    
    if !success {
        // Handle failure case
        refund_payment(amount);
    }
}
```

### 3. Minimize Cross-Contract Dependencies  
```rust
// ✅ Good - minimal, well-defined interface
interface TokenInterface {
    fn transfer(from: AztecAddress, to: AztecAddress, amount: Field);
    fn balance_of(owner: AztecAddress) -> Field;
}

// ❌ Avoid - tight coupling to specific implementation
```

### 4. Use Events for Cross-Contract Coordination
```rust
// ✅ Good - emit events for coordination
#[private]
fn complete_trade() {
    // Complete private operations
    process_private_trade();
    
    // Emit public event for coordination
    TradeCompleted::at(context.this_address()).emit_event().enqueue(&mut context);
}
```

## Key Takeaways

1. **Cross-contract calls enable composability** - build complex systems from simpler components
2. **Privacy is maintained across contract boundaries** - private calls stay private
3. **Authorization is crucial** - verify contracts are allowed to interact
4. **Public coordination enables hybrid patterns** - private execution with public settlement
5. **Testing requires multi-contract setup** - integration tests are essential
6. **Design for modularity** - minimize tight coupling between contracts

---

## Next Steps

Now that you understand cross-contract communication, let's explore managing complex workflows that involve both private and public state transitions.

**Continue to:** [State Transitions →](/aztec/learning_journey/phase_6/state_transitions)

---

**Phase 6 Navigation:**  
[← Authorization Patterns](/aztec/learning_journey/phase_6/authorization_patterns) | **Cross-Contract Communication** | [State Transitions →](/aztec/learning_journey/phase_6/state_transitions)