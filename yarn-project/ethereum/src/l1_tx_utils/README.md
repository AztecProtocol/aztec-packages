# L1 Transaction Utils

This module handles sending L1 txs, including simulating txs, choosing gas prices, estimating gas limits, monitoring sent txs, speeding them up, and cancelling them. Each instance of `L1TxUtils` is stateful, corresponds to a given **publisher** EOA, and tracks its in-flight txs.

## Usage context

Aside from bootstrapping (such as deploying L1 contracts), the Aztec node sends txs to L1 for the following purposes:

### Sequencing

As a sequencer (ie block proposer), the node sends blob txs proposing new L2 blocks. These txs may be part of a multicall where the proposer also votes for a proposal, slashes other validators, or invalidates a block. If block building fails, the sequencer may send a multicall without a block (and hence without blobs). These actions have a specific set of L1 blocks in which they may land (ie an L2 slot, which lasts 2-6 L1 slots), after which they "expire" and revert if mined. On each L2 slot, at most one L1 tx is in-flight.

A given block proposer is chosen at random. While chances are low, it could be the case that the same proposer is chosen for two L2 slots in a row.

There is an edge case in which block building fails at the beginning of the slot (for instance, if there are not enough L2 txs to build the block), which means only a vote or a slash is sent to L1, but then the block does get built, and is submitted in a separate L1 tx.

### Proving

As a prover, the node sends a tx with a validity proof for an epoch. These txs also have an expiration window, after which they revert if they'd land. No blobs are used. The cost is 1M-4M gas, and these txs are sent at most once per epoch, which is about 96-384 L1 slots.

Provers typically try proving all epochs. Today the proof submission window is set to one epoch, meaning that each epoch must be proven during the next, so there is no overlap. If this window were to be extended, then we could have multiple L1 proving txs in flight, which must land in order.

## Properties

From the usage context above, we know that:

- Each publisher EOA has typically only one in-flight tx at a time.
- Every tx has an expiration time after which they'd revert if mined.

## State transitions

We keep all our **publishers** split by scope, where the scope may be _proving_ or _sequencing_. If sequencing, publishers are also scoped by validator address, so a node that runs multiple validators may use different publisher accounts for each validator, to avoid publicly linking them. Note that a publisher may belong to more than one scope.

Each publisher account is in one of the following states, which is reflected from the state of the tx with the highest nonce it has sent:

- `idle`: Ready to send a tx
- `sent`: A tx has been sent and we are awaiting for it to be mined
- `speed-up`: The tx has been replaced with the same tx but higher gas price
- `cancelled`: The tx has expired so it has been replaced with a noop tx
- `not-mined`: The tx has expired or was dropped and we are no longer monitoring it
- `mined`: The tx or one of its replacements (ie a tx with the same nonce) has been mined

With the following state transitions:

| From | To | Condition | Effect |
|-|-|-|-|
| `idle` | `sent` | `send_tx` | A new tx is sent and nonce is consumed |
| `sent` | `speed-up`| `time_since_last_sent > stall_time && retry_attempts < max_retries` | The requested tx is replaced with an equivalent but higher gas price |
| `sent`, `speed-up` | `not-mined` | `current_time > tx_timeout && !cancel_on_timeout` | The tx times out, nonce manager is reset |
| `sent`, `speed-up` | `cancelled` | `current_time > tx_timeout && cancel_on_timeout` | The tx times out and we replace it with a noop |
| `sent`, `speed-up`, `cancelled` | `mined` | `get_nonce(latest) > tx_nonce` | The tx or a replacement is mined |
| `cancelled` | `not-mined` | `current_time > cancel_tx_timeout` | Cancellation times out, nonce manager is reset |
| `cancelled` | `not-mined` | `nonce no longer in mempool && time_passed > unseen_considered_dropped` | Cancel tx dropped from mempool, nonce manager is reset |

Note that we do not transition back to `idle`.

## Nonce Management

The `L1TxUtils` class uses a `NonceManager` from viem to track and manage nonces for the publisher account:

- **Nonce consumption**: When sending a new transaction, the nonce is consumed from the nonce manager, which increments the internal counter.
- **Nonce reset**: The nonce manager is reset in the following scenarios:
  - When a regular tx times out without being cancelled (`NOT_MINED` state)
  - When a cancellation tx is dropped from the mempool
  - When a cancellation tx itself times out
  - When we decide not to send a cancellation due to interruption or the original tx being dropped

The reset allows the next transaction to reuse the nonce if the current tx is no longer in the mempool by the time this next transaction is sent.

## Time checks

All time checks for speed ups and time outs are based on L1 time, not local time. When se send a tx, we assign the `sent_at` time to the time of the most recent L1 block. Using L1 time means that speed ups and time outs can be expressed in terms of L1 slots. It also means that we will wait for a new L1 block to be mined and check if our tx is present in that block before computing time outs or speed ups. 

An edge case here is that, if an L1 slot is missed (ie there is no L1 block for that slot), we won't update time outs during that 12s period. Given how infrequent these are, we are fine with this tradeoff.

## Pseudocode

```python
def send_and_monitor_tx(tx_request):
  # Always consume a fresh nonce from the nonce manager
  nonce = nonce_manager.consume()

  # Build and send the transaction
  tx = make_tx(tx_request, nonce)
  state = create_state(tx, status='sent')
  txs.push(state)
  l1.send_tx(tx)

  # State transitions differ based on whether this is a cancel tx
  is_cancel_tx = state.cancelTxHashes.length > 0

  # Monitor loop
  loop:
    # Check if interrupted
    if interrupted:
      break

    # Check if the tx was mined
    current_nonce = l1.get_nonce(latest)
    if current_nonce > nonce:
      # Try to find the receipt from all tx attempts
      for tx in state.txHashes + state.cancelTxHashes:
        if receipt = l1.get_tx_receipt(tx):
          state.status = 'mined'
          return receipt
      # Unknown tx was mined with our nonce
      state.status = 'mined'
      raise unknown_mined_tx_error

    # Check if cancel tx dropped from mempool (only for cancellations)
    pending_nonce = l1.get_nonce(pending)
    if is_cancel_tx and pending_nonce < nonce and time_passed > unseen_considered_dropped:
      state.status = 'idle'
      nonce_manager.reset()
      raise dropped_transaction_error

    # Check if tx has timed out
    if is_timed_out(state, l1_timestamp):
      if is_cancel_tx or !cancel_on_timeout:
        # Either already a cancel tx or configured not to cancel
        state.status = 'not-mined'
        nonce_manager.reset()
        raise timeout_error
      else:
        # Send cancellation in background
        run_in_background attempt_tx_cancellation(state)
        raise timeout_error

    # Speed up if stalled and have retries left
    if time_since_last_sent > stall_time and attempts < max_attempts:
      replacement_tx = make_tx(tx_request, nonce, bump_gas_price(state.gasPrice))
      state.status = is_cancel_tx ? 'cancelled' : 'speed-up'
      state.tx_hashes.push(send_tx(replacement_tx))
      state.last_sent_at = now
      continue

    sleep(check_interval)

def attempt_tx_cancellation(state):
  # Check if original tx still in mempool
  if l1.get_nonce(pending) < state.nonce:
    state.status = 'not-mined'
    nonce_manager.reset()
    return

  # Send noop tx with same nonce but higher gas
  cancel_tx = make_noop_tx(state.nonce, bump_gas_price(state.gasPrice))
  state.cancelTxHashes.push(send_tx(cancel_tx))
  state.status = 'cancelled'

  # Monitor the cancellation in background
  run_in_background monitor_transaction(state)
```

## Publisher selection

When sending a tx for a given scope, we choose from all publishers for the scope in the following order:

- `idle`: The publisher is ready to be used and has not sent any txs recently.
- `mined`: The publisher has mined a tx and is ready for a new one.
- `speed-up`, `sent`: There is a tx in-flight, new one will be enqueued after (not eligible unless `publisherAllowInvalidStates` is set).
- `cancelled`: There is a tx in-flight caused by a time-out mining the previous one, new tx will be enqueued after (not eligible unless `publisherAllowInvalidStates` is set).
- `not-mined`: The previous tx timed out or was dropped, new tx will reuse the same nonce if previous one is no longer in the mempool, or pick the next otherwise (not eligible unless `publisherAllowInvalidStates` is enabled).

If there is more than one publisher in the same state to choose from, we prefer choosing based on:
1. Highest balance first
2. Least recently used (based on `lastMinedAtBlockNumber`)

Available publishers should be filtered by balance, ensuring that the given EOA has enough funds to send the tx, and possibly replace it with a larger gas price. If we detect a publisher account has not enough gas, we should warn (bonus points if we warn before running out).

Note that selection is not handled by the `L1TxUtils` class but by the `PublisherManager`.

## API

- `sendTransaction`: Sends an L1 tx and returns the tx hash. Returns when the tx has been sent. Consumes a nonce from the nonce manager.
- `monitorTransaction`: Monitors a sent tx and speeds up or cancels it. Returns when mined or timed out. May reset the nonce manager on timeout.
- `sendAndMonitorTransaction`: Combines sending and monitoring in a single call.