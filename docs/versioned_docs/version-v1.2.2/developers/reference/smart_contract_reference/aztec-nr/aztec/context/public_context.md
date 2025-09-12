# PublicContext

/ # PublicContext / / The **main interface** between a #[public] function and the Aztec blockchain. / / An instance of the PublicContext is initialized automatically at the outset / of every public function, within the #[public] macro, so you'll never / need to consciously instantiate this yourself. / / The instance is always named `context`, and it will always be available / within the body of every #[public] function in your smart contract. / / Typical usage for a smart contract developer will be to call getter / methods of the PublicContext. / / _Pushing_ data and requests to the context is mostly handled within / aztec-nr's own functions, so typically a smart contract developer won't / need to call any setter methods directly. / / ## Responsibilities / - Exposes contextual data to a public function: /   - Data relating to how this public function was called: /     - msg_sender, this_address /   - Data relating to the current blockchain state: /     - timestamp, block_number, chain_id, version /   - Gas and fee information / - Provides state access: /   - Read/write public storage (key-value mapping) /   - Check existence of notes and nullifiers /     (Some patterns use notes & nullifiers to store public (not private) /     information) /   - Enables consumption of L1-&gt;L2 messages. / - Enables calls to other public smart contract functions: / - Writes data to the blockchain: /   - Updates to public state variables /   - New public logs (for events) /   - New L2-&gt;L1 messages /   - New notes & nullifiers /     (E.g. pushing public info to notes/nullifiers, or for completing /     "partial notes") / / ## Key Differences from Private Execution / / Unlike private functions -- which are executed on the user's device and which / can only reference historic state -- public functions are executed by a block / proposer and are executed "live" on the _current_ tip of the chain. / This means public functions can: / - Read and write _current_ public state / - Immediately see the effects of earlier transactions in the same block / / Also, public functions are executed within a zkVM (the "AVM"), so that they / can _revert_ whilst still ensuring payment to the proposer and prover. / (Private functions cannot revert: they either succeed, or they cannot be / included). / / ## Optimising Public Functions / / Using the AVM to execute public functions means they compile down to "AVM / bytecode" instead of the ACIR that private functions (standalone circuits) / compile to. Therefore the approach to optimising a public function is / fundamentally different from optimising a public function. /

## Fields
| Field | Type |
| --- | --- |
| pub args_hash | Option&lt;Field&gt; |
| pub compute_args_hash | fn() -&gt; Field |

## Methods

### new

/ Creates a new PublicContext instance. /// Low-level function: This is called automatically by the #[public] / macro, so you shouldn't need to be called directly by smart contract / developers. /// # Arguments / * `compute_args_hash` - Function to compute the args_hash /// # Returns / * A new PublicContext instance /

```rust
PublicContext::new(compute_args_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| compute_args_hash | fn( |

### emit_public_log

/ Emits a _public_ log that will be visible onchain to everyone. /// # Arguments / * `log` - The data to log, must implement Serialize trait /

```rust
PublicContext::emit_public_log(_self, log);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | &mut Self |
| log | T |

### note_hash_exists

/ Checks if a given note hash exists in the note hash tree at a particular / leaf_index. /// # Arguments / * `note_hash` - The note hash to check for existence / * `leaf_index` - The index where the note hash should be located /// # Returns / * `bool` - True if the note hash exists at the specified index /

```rust
PublicContext::note_hash_exists(_self, note_hash, leaf_index);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| note_hash | Field |
| leaf_index | Field |

### l1_to_l2_msg_exists

/ Checks if a specific L1-to-L2 message exists in the L1-to-L2 message / tree at a particular leaf index. /// Common use cases include token bridging, cross-chain governance, and / triggering L2 actions based on L1 events. /// This function should be called before attempting to consume an L1-to-L2 / message. /// # Arguments / * `msg_hash` - Hash of the L1-to-L2 message to check / * `msg_leaf_index` - The index where the message should be located /// # Returns / * `bool` - True if the message exists at the specified index /// # Advanced / * Uses the AVM l1_to_l2_msg_exists opcode for tree lookup / * Messages are copied from L1 Inbox to L2 by block proposers /

```rust
PublicContext::l1_to_l2_msg_exists(_self, msg_hash, msg_leaf_index);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| msg_hash | Field |
| msg_leaf_index | Field |

### nullifier_exists

/ Checks if a specific nullifier has been emitted by a given contract. /// Whilst nullifiers are primarily intended as a _privacy-preserving_ / record of a one-time action, they can also be used to efficiently / record _public_ one-time actions too. An example is to check / whether a contract has been published: we emit a nullifier that is / deterministic, but whose preimage is _not_ private. This is more / efficient than using mutable storage, and can be done directly / from a private function. /// Nullifiers can be tested for non-existence in public, which is not the / case in private. Because private functions do not have access to / the tip of the blockchain (but only the anchor block they are built / at) they can only prove nullifier non-existence in the past. But between / an anchor block and the block in which a tx is included, the nullifier / might have been inserted into the nullifier tree by some other / transaction. / Public functions _do_ have access to the tip of the state, and so / this pattern is safe. /// # Arguments / * `unsiloed_nullifier` - The raw nullifier value (before siloing with /                          the contract address that emitted it). / * `address` - The claimed contract address that emitted the nullifier /// # Returns / * `bool` - True if the nullifier has been emitted by the specified contract /

```rust
PublicContext::nullifier_exists(_self, unsiloed_nullifier, address);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| unsiloed_nullifier | Field |
| address | AztecAddress |

### consume_l1_to_l2_message

/ Consumes a message sent from Ethereum (L1) to Aztec (L2) -- effectively / marking it as "read". /// Use this function if you only want the message to ever be "referred to" / once. Once consumed using this method, the message cannot be consumed / again, because a nullifier is emitted. / If your use case wants for the message to be read unlimited times, then / you can always read any historic message from the L1-to-L2 messages tree, / using the `l1_to_l2_msg_exists` method. Messages never technically get / deleted from that tree. /// The message will first be inserted into an Aztec "Inbox" smart contract / on L1. It will not be available for consumption immediately. Messages / get copied-over from the L1 Inbox to L2 by the next Proposer in batches. / So you will need to wait until the messages are copied before you can / consume them. /// # Arguments / * `content` - The message content that was sent from L1 / * `secret` - Secret value used for message privacy (if needed) / * `sender` - Ethereum address that sent the message / * `leaf_index` - Index of the message in the L1-to-L2 message tree /// # Advanced / * Validates message existence in the L1-to-L2 message tree / * Prevents double-consumption by emitting a nullifier / * Message hash is computed from all parameters + chain context / * Will revert if message doesn't exist or was already consumed /

```rust
PublicContext::consume_l1_to_l2_message(&mut self, content, secret, sender, leaf_index, );
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| content | Field |
| secret | Field |
| sender | EthAddress |
| leaf_index | Field |
|  |  |

### message_portal

/ Sends an "L2 -&gt; L1 message" from this function (Aztec, L2) to a smart / contract on Ethereum (L1). L1 contracts which are designed to / send/receive messages to/from Aztec are called "Portal Contracts". /// Common use cases include withdrawals, cross-chain asset transfers, and / triggering L1 actions based on L2 state changes. /// The message will be inserted into an Aztec "Outbox" contract on L1, / when this transaction's block is proposed to L1. / Sending the message will not result in any immediate state changes in / the target portal contract. The message will need to be manually / consumed from the Outbox through a separate Ethereum transaction: a user / will need to call a function of the portal contract -- a function / specifically designed to make a call to the Outbox to consume the / message. / The message will only be available for consumption once the _epoch_ / proof has been submitted. Given that there are multiple Aztec blocks / within an epoch, it might take some time for this epoch proof to be / submitted -- especially if the block was near the start of an epoch. /// # Arguments / * `recipient` - Ethereum address that will receive the message / * `content` - Message content (32 bytes as a Field element) /

```rust
PublicContext::message_portal(_self, recipient, content);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | &mut Self |
| recipient | EthAddress |
| content | Field |

### call_public_function

```rust
PublicContext::call_public_function(_self, contract_address, function_selector, args, gas_opts, );
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | &mut Self |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args | [Field] |
| gas_opts | GasOpts |
|  |  |

### static_call_public_function

```rust
PublicContext::static_call_public_function(_self, contract_address, function_selector, args, gas_opts, );
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | &mut Self |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args | [Field] |
| gas_opts | GasOpts |
|  |  |

### push_note_hash

/ Adds a new note hash to the Aztec blockchain's global Note Hash Tree. /// Notes are ordinarily constructed and emitted by _private_ functions, to / ensure that both the content of the note, and the contract that emitted / the note, stay private. /// There are however some useful patterns whereby a note needs to contain / _public_ data. The ability to push a new note_hash from a _public_ / function means that notes can be injected with public data immediately / -- as soon as the public value is known. The slower alternative would / be to submit a follow-up transaction so that a private function can / inject the data. Both are possible on Aztec. /// Search "Partial Note" for a very common pattern which enables a note / to be "partially" populated with some data in a _private_ function, and / then later "completed" with some data in a public function. /// # Arguments / * `note_hash` - The hash of the note to add to the tree /// # Advanced / * The note hash will be siloed with the contract address by the protocol /

```rust
PublicContext::push_note_hash(_self, note_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | &mut Self |
| note_hash | Field |

### push_nullifier

/ Adds a new nullifier to the Aztec blockchain's global Nullifier Tree. /// Whilst nullifiers are primarily intended as a _privacy-preserving_ / record of a one-time action, they can also be used to efficiently / record _public_ one-time actions too. Hence why you're seeing this / function within the PublicContext. / An example is to check whether a contract has been published: we emit / a nullifier that is deterministic, but whose preimage is _not_ private. /// # Arguments / * `nullifier` - A unique field element that represents the consumed /   state /// # Advanced / * Nullifier is immediately added to the global nullifier tree / * Emitted nullifiers are immediately visible to all /   subsequent transactions in the same block / * Automatically siloed with the contract address by the protocol / * Used for preventing double-spending and ensuring one-time actions /

```rust
PublicContext::push_nullifier(_self, nullifier);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | &mut Self |
| nullifier | Field |

### this_address

/ Returns the address of the current contract being executed. /// This is equivalent to `address(this)` in Solidity (hence the name). / Use this to identify the current contract's address, commonly needed for / access control or when interacting with other contracts. /// # Returns / * `AztecAddress` - The contract address of the current function being /                    executed. /

```rust
PublicContext::this_address(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### transfer

```rust
PublicContext::transfer(context, to, amount);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PublicContext |
| to | AztecAddress |
| amount | u64 |

### msg_sender

/ Returns the contract address that initiated this function call. /// This is similar to `msg.sender` in Solidity (hence the name). /// Important Note: Since Aztec doesn't have a concept of an EoA ( / Externally-owned Account), the msg_sender is "undefined" for the first / function call of every transaction. A value of `-1` is returned in such / cases, and is enforced by the protocol's kernel circuits. / The first function call of a tx is likely to be a call to the user's / account contract, so this quirk will most often be handled by account / contract developers. /// # Returns / * `AztecAddress` - The address of the account or contract that called /   this function /// # Examples / ```rust / #[aztec(public)] / fn transfer(context: &mut PublicContext, to: AztecAddress, amount: u64) { /     let sender = context.msg_sender(); /     // Only the sender can transfer their own tokens /     assert(sender == get_token_owner(), "Unauthorized"); / } / ``` /// # Advanced / * Value is provided by the AVM sender opcode / * In nested calls, this is the immediate caller, not the original /   transaction sender / * Globally visible unlike private execution where it's contract-local

```rust
PublicContext::msg_sender(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### selector

/ Returns the function selector of the currently-executing function. /// This is similar to `msg.sig` in Solidity, returning the first 4 / bytes of the function signature. /// # Returns / * `FunctionSelector` - The 4-byte function identifier /// # Advanced / * Extracted from the first element of calldata / * Used internally for function dispatch in the AVM /

```rust
PublicContext::selector(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### get_args_hash

/ Returns the hash of the arguments passed to the current function. /// Very low-level function: The #[public] macro uses this internally. / Smart contract developers typically won't need to access this / directly as arguments are automatically made available. /// # Returns / * `Field` - Hash of the function arguments /

```rust
PublicContext::get_args_hash(mut self);
```

#### Parameters
| Name | Type |
| --- | --- |
| mut self |  |

### transaction_fee

/ Returns the "transaction fee" for the current transaction. / This is the final tx fee that will be deducted from the fee_payer's / "fee-juice" balance (in the protocol's Base Rollup circuit). /// # Returns / * `Field` - The actual, final cost of the transaction, taking into account: /             the actual gas used during the setup and app-logic phases, /             and the fixed amount of gas that's been allocated by the user /             for the teardown phase. /             I.e. effectiveL2FeePerGas * l2GasUsed + effectiveDAFeePerGas * daGasUsed /// This will return `0` during the "setup" and "app-logic" phases of / tx execution (because the final tx fee is not known at that time). / This will only return a nonzero value during the "teardown" phase of / execution, where the final tx fee can actually be computed. /// Regardless of _when_ this function is called during the teardown phase, / it will always return the same final tx fee value. The teardown phase / does not consume a variable amount of gas: it always consumes a / pre-allocated amount of gas, as specified by the user when they generate / their tx. /

```rust
PublicContext::transaction_fee(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### chain_id

/ Returns the chain ID of the current network. /// This is similar to `block.chainid` in Solidity. Returns the unique / identifier for the blockchain network this transaction is executing on. /// Helps prevent cross-chain replay attacks. Useful if implementing / multi-chain contract logic. /// # Returns / * `Field` - The chain ID as a field element /

```rust
PublicContext::chain_id(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### version

/ Returns the Aztec protocol version that this transaction is executing / under. Different versions may have different rules, opcodes, or / cryptographic primitives. /// This is similar to how Ethereum has different EVM versions. /// Useful for forward/backward compatibility checks /// Not to be confused with contract versions; this is the protocol version. /// # Returns / * `Field` - The protocol version as a field element /

```rust
PublicContext::version(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### block_number

/ Returns the current block number. /// This is similar to `block.number` in Solidity. /// Note: the current block number is only available within a public function / (as opposed to a private function). /// Note: the time intervals between blocks should not be relied upon as / being consistent: / - Timestamps of blocks fall within a range, rather than at exact regular /   intervals. / - Slots can be missed. / - Protocol upgrades can completely change the intervals between blocks /   (and indeed the current roadmap plans to reduce the time between /   blocks, eventually). / Use `context.timestamp()` for more-reliable time-based logic. /// # Returns / * `u32` - The current block number /

```rust
PublicContext::block_number(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### timestamp

/ Returns the timestamp of the current block. /// This is similar to `block.timestamp` in Solidity. /// All functions of all transactions in a block share the exact same / timestamp (even though technically each transaction is executed / one-after-the-other). /// Important note: Timestamps of Aztec blocks are not at reliably-fixed / intervals. The proposer of the block has some flexibility to choose a / timestamp which is in a valid _range_: Obviously the timestamp of this / block must be strictly greater than that of the previous block, and must / must be less than the timestamp of whichever ethereum block the aztec / block is proposed to. Furthermore, if the timestamp is not deemed close / enough to the actual current time, the committee of validators will not / attest to the block. /// # Returns / * `u64` - Unix timestamp in seconds /

```rust
PublicContext::timestamp(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### fee_per_l2_gas

/ Returns the fee per unit of L2 gas for this transaction (aka the "L2 gas / price"), as chosen by the user. /// L2 gas covers the cost of executing public functions and handling / side-effects within the AVM. /// # Returns / * `u128` - Fee per unit of L2 gas /// Wallet developers should be mindful that the choice of gas price (which / is publicly visible) can leak information about the user, e.g.: / - which wallet software the user is using; / - the amount of time which has elapsed from the time the user's wallet /   chose a gas price (at the going rate), to the time of tx submission. /   This can give clues about the proving time, and hence the nature of /   the tx. / - the urgency of the transaction (which is kind of unavoidable, if the /   tx is indeed urgent). / - the wealth of the user. / - the exact user (if the gas price is explicitly chosen by the user to /   be some unique number like 0.123456789, or their favourite number). / Wallet devs might wish to consider fuzzing the choice of gas price. /

```rust
PublicContext::fee_per_l2_gas(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### fee_per_da_gas

/ Returns the fee per unit of DA (Data Availability) gas (aka the "DA gas / price"). /// DA gas covers the cost of making transaction data available on L1. /// See the warning in `fee_pre_l2_gas` for how gas prices can be leaky. /// # Returns / * `u128` - Fee per unit of DA gas /

```rust
PublicContext::fee_per_da_gas(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### l2_gas_left

/ Returns the remaining L2 gas available for this transaction. /// Different AVM opcodes consume different amounts of gas. /// # Returns / * `u32` - Remaining L2 gas units /

```rust
PublicContext::l2_gas_left(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### da_gas_left

/ Returns the remaining DA (Data Availability) gas available for this / transaction. /// DA gas is consumed when emitting data that needs to be made available / on L1, such as public logs or state updates. / All of the side-effects from the private part of the tx also consume / DA gas before execution of any public functions even begins. /// # Returns / * `u32` - Remaining DA gas units /

```rust
PublicContext::da_gas_left(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### is_static_call

/ Checks if the current execution is within a staticcall context, where / no state changes or logs are allowed to be emitted (by this function / or any nested function calls). /// # Returns / * `bool` - True if in staticcall context, false otherwise /

```rust
PublicContext::is_static_call(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### raw_storage_read

/ Reads raw field values from public storage. / Reads N consecutive storage slots starting from the given slot. /// Very low-level function. Users should typically use the public state / variable abstractions to perform reads: PublicMutable & PublicImmutable. /// # Arguments / * `storage_slot` - The starting storage slot to read from /// # Returns / * `[Field; N]` - Array of N field values from consecutive storage slots /// # Generic Parameters / * `N` - the number of consecutive slots to return, starting from the /         `storage_slot`. /

```rust
PublicContext::raw_storage_read(_self, storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| storage_slot | Field |

### storage_read

/ Reads a typed value from public storage. /// Low-level function. Users should typically use the public state / variable abstractions to perform reads: PublicMutable & PublicImmutable. /// # Arguments / * `storage_slot` - The storage slot to read from /// # Returns / * `T` - The deserialized value from storage /// # Generic Parameters / * `T` - The type that the caller expects to read from the `storage_slot`. / * `N` - the number of Fields that `T` packs into, according to its /         impl of `Packable&lt;N&gt;`. /

```rust
PublicContext::storage_read(self, storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| storage_slot | Field |

### raw_storage_write

/ Writes raw field values to public storage. / Writes to N consecutive storage slots starting from the given slot. /// Very low-level function. Users should typically use the public state / variable abstractions to perform writes: PublicMutable & PublicImmutable. /// Public storage writes take effect immediately. /// # Arguments / * `storage_slot` - The starting storage slot to write to / * `values` - Array of N Fields to write to storage /

```rust
PublicContext::raw_storage_write(_self, storage_slot, values);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| storage_slot | Field |
| values | [Field; N] |

### storage_write

/ Writes a typed value to public storage. /// Low-level function. Users should typically use the public state / variable abstractions to perform writes: PublicMutable & PublicImmutable. /// # Arguments / * `storage_slot` - The storage slot to write to / * `value` - The typed value to write to storage /// # Generic Parameters / * `T` - The type to write to storage. / * `N` - the number of Fields that `T` packs into, according to its /         impl of `Packable&lt;N&gt;`. /

```rust
PublicContext::storage_write(self, storage_slot, value);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| storage_slot | Field |
| value | T |

## Standalone Functions

### address

```rust
address();
```

Takes no parameters.

### sender

```rust
sender();
```

Takes no parameters.

### emit_note_hash

```rust
emit_note_hash(note_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| note_hash | Field |

### emit_nullifier

```rust
emit_nullifier(nullifier);
```

#### Parameters
| Name | Type |
| --- | --- |
| nullifier | Field |

### send_l2_to_l1_msg

```rust
send_l2_to_l1_msg(recipient, content);
```

#### Parameters
| Name | Type |
| --- | --- |
| recipient | EthAddress |
| content | Field |

### call

```rust
call(l2_gas_allocation, da_gas_allocation, address, args, );
```

#### Parameters
| Name | Type |
| --- | --- |
| l2_gas_allocation | u32 |
| da_gas_allocation | u32 |
| address | AztecAddress |
| args | [Field] |
|  |  |

### call_static

```rust
call_static(l2_gas_allocation, da_gas_allocation, address, args, );
```

#### Parameters
| Name | Type |
| --- | --- |
| l2_gas_allocation | u32 |
| da_gas_allocation | u32 |
| address | AztecAddress |
| args | [Field] |
|  |  |

### calldata_copy

```rust
calldata_copy(cdoffset, copy_size);
```

#### Parameters
| Name | Type |
| --- | --- |
| cdoffset | u32 |
| copy_size | u32 |

### success_copy

```rust
success_copy();
```

Takes no parameters.

### returndata_size

```rust
returndata_size();
```

Takes no parameters.

### returndata_copy

```rust
returndata_copy(rdoffset, copy_size);
```

#### Parameters
| Name | Type |
| --- | --- |
| rdoffset | u32 |
| copy_size | u32 |

### avm_return

```rust
avm_return(returndata);
```

#### Parameters
| Name | Type |
| --- | --- |
| returndata | [Field] |

### avm_revert

```rust
avm_revert(revertdata);
```

#### Parameters
| Name | Type |
| --- | --- |
| revertdata | [Field] |

### empty

```rust
empty();
```

Takes no parameters.

### address_opcode

```rust
address_opcode();
```

Takes no parameters.

### sender_opcode

```rust
sender_opcode();
```

Takes no parameters.

### transaction_fee_opcode

```rust
transaction_fee_opcode();
```

Takes no parameters.

### chain_id_opcode

```rust
chain_id_opcode();
```

Takes no parameters.

### version_opcode

```rust
version_opcode();
```

Takes no parameters.

### block_number_opcode

```rust
block_number_opcode();
```

Takes no parameters.

### timestamp_opcode

```rust
timestamp_opcode();
```

Takes no parameters.

### fee_per_l2_gas_opcode

```rust
fee_per_l2_gas_opcode();
```

Takes no parameters.

### fee_per_da_gas_opcode

```rust
fee_per_da_gas_opcode();
```

Takes no parameters.

### l2_gas_left_opcode

```rust
l2_gas_left_opcode();
```

Takes no parameters.

### da_gas_left_opcode

```rust
da_gas_left_opcode();
```

Takes no parameters.

### is_static_call_opcode

```rust
is_static_call_opcode();
```

Takes no parameters.

### note_hash_exists_opcode

```rust
note_hash_exists_opcode(note_hash, leaf_index);
```

#### Parameters
| Name | Type |
| --- | --- |
| note_hash | Field |
| leaf_index | Field |

### emit_note_hash_opcode

```rust
emit_note_hash_opcode(note_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| note_hash | Field |

### nullifier_exists_opcode

```rust
nullifier_exists_opcode(nullifier, address);
```

#### Parameters
| Name | Type |
| --- | --- |
| nullifier | Field |
| address | Field |

### emit_nullifier_opcode

```rust
emit_nullifier_opcode(nullifier);
```

#### Parameters
| Name | Type |
| --- | --- |
| nullifier | Field |

### emit_public_log_opcode

```rust
emit_public_log_opcode(message);
```

#### Parameters
| Name | Type |
| --- | --- |
| message | [Field] |

### l1_to_l2_msg_exists_opcode

```rust
l1_to_l2_msg_exists_opcode(msg_hash, msg_leaf_index);
```

#### Parameters
| Name | Type |
| --- | --- |
| msg_hash | Field |
| msg_leaf_index | Field |

### send_l2_to_l1_msg_opcode

```rust
send_l2_to_l1_msg_opcode(recipient, content);
```

#### Parameters
| Name | Type |
| --- | --- |
| recipient | EthAddress |
| content | Field |

### calldata_copy_opcode

```rust
calldata_copy_opcode(cdoffset, copy_size);
```

#### Parameters
| Name | Type |
| --- | --- |
| cdoffset | u32 |
| copy_size | u32 |

### returndata_size_opcode

```rust
returndata_size_opcode();
```

Takes no parameters.

### returndata_copy_opcode

```rust
returndata_copy_opcode(rdoffset, copy_size);
```

#### Parameters
| Name | Type |
| --- | --- |
| rdoffset | u32 |
| copy_size | u32 |

### return_opcode

```rust
return_opcode(returndata);
```

#### Parameters
| Name | Type |
| --- | --- |
| returndata | [Field] |

### revert_opcode

```rust
revert_opcode(revertdata);
```

#### Parameters
| Name | Type |
| --- | --- |
| revertdata | [Field] |

### call_opcode

```rust
call_opcode(l2_gas_allocation, da_gas_allocation, address, args, );
```

#### Parameters
| Name | Type |
| --- | --- |
| l2_gas_allocation | u32 |
| da_gas_allocation | u32 |
| address | AztecAddress |
| args | [Field] |
|  |  |

### call_static_opcode

```rust
call_static_opcode(l2_gas_allocation, da_gas_allocation, address, args, );
```

#### Parameters
| Name | Type |
| --- | --- |
| l2_gas_allocation | u32 |
| da_gas_allocation | u32 |
| address | AztecAddress |
| args | [Field] |
|  |  |

### success_copy_opcode

```rust
success_copy_opcode();
```

Takes no parameters.

### storage_read_opcode

```rust
storage_read_opcode(storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| storage_slot | Field |

### storage_write_opcode

```rust
storage_write_opcode(storage_slot, value);
```

#### Parameters
| Name | Type |
| --- | --- |
| storage_slot | Field |
| value | Field |

