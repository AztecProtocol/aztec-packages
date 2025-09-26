# L1 Transaction Utils

This module handles sending L1 txs, including simulating txs, choosing gas prices, estimating gas limits, monitoring sent txs, speeding them up, and cancelling them. Each instance of `L1TxUtils` is stateful, corresponds to a given **publisher** EOA, and tracks its in-flight txs.

## Usage context

Aside from bootstrapping (such as deploying L1 contracts), the Aztec node sends txs to L1 for the following purposes:

### Sequencing

As a sequencer (ie block proposer), the node sends blob txs proposing new L2 blocks. These txs may be part of a multicall where the proposer also votes for a proposal, slashes other validators, or invalidates a block. If block building fails, the sequencer may send a multicall without a block (and hence without blobs). These actions have a specific set of L1 blocks in which they may land (ie an L2 slot, which lasts 2-6 L1 slots), after which they "expire" and revert if mined. On each L2 slot, at most one L1 tx is in-flight.

A given block proposer is chosen at random. While chances are low, it could be the case that the same proposer is chosen for two L2 slots in a row.

There is an edge case in which block building fails at the beginning of the slot (for instance, if there are not enough L2 txs to build the block), which means only a vote or a slash is sent to L1, but then the block does get built, and is submitted in a separate L1 tx. We do not support this edge case.

### Proving

As a prover, the node sends a tx with a validity proof for an epoch. These txs also have an expiration window, after which they revert if they'd land. No blobs are used. The cost is 1M-4M gas, and these txs are sent at most once per epoch, which is about 96-384 L1 slots. 

Provers typically try proving all epochs. Today the proof submission window is set to one epoch, meaning that each epoch must be proven during the next, so there is no overlap. If this window were to be extended, then we could have multiple L1 proving txs in flight, which must land in order, but we do not support this at the moment.

## Properties

From the usage context above, we know that:

- Each publisher EOA has only one in-flight tx at a time.
- Every tx has an expiration time after which they'd revert if mined.

## State transitions

We keep all our **publishers** split by scope, where the scope may be _proving_ or _sequencing_. If sequencing, publishers are also scoped by validator address, so a node that runs multiple validators may use different publisher accounts for each validator, to avoid publicly linking them. Note that a publisher may belong to more than one scope.

Each publisher account is in one of the following states:

- `idle`: Ready to send a tx
- `tx-sent`: A tx has been sent and we are awaiting for it to be mined
- `tx-speed-up`: The tx has been replaced with the same tx but higher gas price
- `tx-cancelled`: The tx has expired so it has been replaced with a noop tx
- `tx-timed-out`: The tx has expired but we are configured not to send noops
- `tx-mined`: The tx or one of its replacements (ie a tx with the same nonce) has been mined but not yet finalized

With the following state transitions:

| From | To | Condition | Effect |
|-|-|-|-|
| `idle` | `sent` | `send_tx` | A new tx is sent |
| `sent` | `speed-up`| `time_since_last_sent > stall_time && retry_attempts < max_retries` | The requested tx is replaced with an equivalent|
| `sent`, `speed-up` | `timed-out` | `current_time > tx_timeout_at && !noop_on_timeout` | The tx times out |
| `sent`, `speed-up` | `cancelled` | `current_time > tx_timeout_at && noop_on_timeout` | The tx times out and we replace it with a noop |
| `sent`, `speed-up`, `cancelled`, `timed-out` | `mined` | `get_nonce(latest) >= tx_nonce` | The tx or a replacement is mined |
| `cancelled`, `timed-out` | `idle` | `get_nonce(pending) < tx_nonce` | Forget about this tx if no longer in the mempool |
| `mined` | `idle` | `get_nonce(finalized) >= tx_nonce` | The mined tx is finalized |
| `mined` | `sent` | `get_nonce(latest) < tx_nonce` | The mined tx was reorg'd out of the chain |

## Pseudocode

```python
def _send_tx(tx, new_state):
  last_tx = tx
  last_sent = now
  all_attempts << tx
  state = new_state
  l1.send_tx(tx)

def send_and_monitor_tx(tx_request):
  # Throw if previous tx if it is still valid
  if state in [sent, speed-up]:
    raise tx_still_in_flight
  
  # Send a fresh tx if we are done with the previous one or we do not want replacements
  if state in [idle, mined] or not config.replace_timed_out_txs:
    nonce = l1.get_nonce(pending) + 1
    tx = make_tx(tx_request, nonce)
    previous_attempts = []
  # Replace previous tx if it is still pending but timed out
  else if state in [cancelled, timed-out]:
    nonce = last_tx.nonce
    tx = make_tx(tx_request, nonce, bump_gas_price(last_tx))
    previous_attempts = all_attempts
    interrupt previous tx loop

  all_attempts = []
  _send_tx(tx, new_state='sent')

  loop:
    # We have been told to stop, either by a replacement or a shutdown
    if interrupted:
      break

    # Check if the tx or a replacement was mined
    if state in [sent, speed-up, cancelled, timed-out] and l1.get_nonce(latest) >= nonce:
      state = 'mined'
      # Loop over all attempts at sending the tx to figure out which one was mined
      # Only return receipt to the caller if this is not a cancellation
      for each tx in all_attempts:
        if receipt = l1.get_tx_receipt(tx):
          return receipt
      # If we replaced the previous tx, then we'll need to retry with this one with a fresh nonce
      for each tx in previous_attempts:
        if receipt = l1.get_tx_receipt(tx):
          return send_and_monitor_tx(tx_request)
      raise receipt_not_found
      continue # Keep looping in the background even if we return control to the caller
      
    # For a mined tx, check if they are still mined, and whether we can consider them finalized
    if state == 'mined':
      if l1.get_nonce(latest) < nonce:
        state = 'sent' # A reorg pushed our tx out, go back to sent and update to fresh state in next iteration
        continue
      else if l1.get_nonce(finalized) >= nonce:
        state = 'idle'
        break # Exit loop for good

    # Check if the tx has timed out and cancel it if configured
    if state in [sent, speed-up] and now > opts.tx_timeout_at:
      if opts.noop_on_timeout:
        # We could avoid sending the noop if the tx is no longer on the mempool, but we risk that it is still
        # in the mempool of other nodes we are not connected to, so it's safer to just cancel it.
        noop_tx = make_tx(noop, nonce, bump_gas_price(last_tx))
        _send_tx(noop_tx, new_state='cancelled')
      else:
        state = 'timed-out'
      raise timed_out
      continue # Keep looping in the background even if we return control to the caller
    
    # Check if we give up on the tx once it is timed out and gone from the mempool
    # Q: Should we add a bit of a time buffer, in case it's just that we've missed this tx from our mempool?
    if state in [cancelled, timed-out] and l1.get_nonce(pending) < nonce:
      state = 'idle'
      break # Exit loop for good

    # Check if we need to speed up the tx, its replacement, or cancellation
    if state in [sent, speed-up, cancelled] and (now - last_sent) > stall_time and all_attempts.size < max_retries:
      replacement_tx = make_tx(tx_request, nonce, bump_gas_price(last_tx))
      new_state = 'speed-up' if state in [sent, speed-up] else 'cancelled'
      _send_tx(replacement_tx, new_state=new_state)
      continue
      
    # Check if we need to resubmit the tx to the mempool
    if state in [sent, speed-up] and not l1.get_tx(last_tx):
      l1.send_tx(last_tx)
      continue
```

## Publisher selection

When sending a tx for a given scope, we choose from all publishers for the scope in the following order:

- `idle`: The publisher is ready to be used
- `tx-mined`: The publisher is ready to be used (assuming no L1 reorgs)
- `tx-cancelled | tx-timed-out`: We try replacing the cancelled tx with the new one
- `tx-sent | tx-speed-up`: Not eligible

If there is more than one publisher in the same state to choose from, we prefer choosing the least recently used one, though ordering by balance (highest balance first) is also acceptable. Available publishers should be filtered by balance, ensuring that the given EOA has enough funds to send the tx, and possibly replace it with a larger gas price. If we detect a publisher account has not enough gas, we should warn (bonus points if we warn before running out).

Note that selection is not handled by the `L1TxUtils` class but by the `PublisherManager`.

## API

- `sendTransaction`: Sends an L1 tx and returns the tx hash. Returns when the tx has been sent.
- `monitorTransaction`: Monitors a sent tx and speeds up or cancels it. Returns when mined or timed out.
- `sendAndMonitorTransaction`: As its name indicates.
