---
title: Partial Notes
description: Describes how partial notes are used in Aztec
tags: [notes, storage]
---

Partial notes are a concept that allows users to commit to an encrypted value, and allows a counterparty to update that value without knowing the specific details of the encrypted value.

## Use cases

Why is this useful?

Consider the case where a user wants to pay for a transaction fee, using a fee-payment contract and they want to do this privately. They can't be certain what the transaction fee will be because the state of the network will have progressed by the time the transaction is processed by the sequencer, and transaction fees are dynamic. So the user can commit to a value for the transaction fee, publicly post this commitment, the fee payer (aka paymaster) can update the public commitment, deducting the final cost of the transaction from the commitment and returning the unused value to the user.

So, in general, the user is:

- doing some computation in private
- encrypting/compressing that computation with a point
- passing that point as an argument to a public function

And the paymaster is:

- updating that point in public
- treating/emitting the result(s) as a note hash(es)

The idea of committing to a value and allowing a counterparty to update that value without knowing the specific details of the encrypted value is a powerful concept that can be used in many different applications. For example, this could be used for updating timestamp values in private, without revealing the exact timestamp, which could be useful for many defi applications.

To do this, we leverage the following properties of elliptic curve operations:

1. `x_1 * G + x_2 * G` equals `(x_1 + x_2) * G` and
2. `f(x) = x * G` being a one-way function.

Property 1 allows us to be continually adding to a point on elliptic curve and property 2 allows us to pass the point to a public realm without revealing anything about the point preimage.

### DEXes

Currently private swaps require 2 transactions. One to start the swap and another to claim the swapped token from the DEX. With partial notes, you can create a note with zero value for the received amount and have another party complete it later from a public function, with the final swapped amount. This reduces the number of transactions needed to swap privately.

Comparing to the flow above, the user is doing some private computation to stage the swap, encrypting the computation with a point and passing the point as an argument to a public function. Then another party is updating that point in public and emitting the result as a note hash for the user doing the swap.

### Lending

A similar pattern can be used for a lending protocol. The user can deposit a certain amount of a token to the lending contract and create a partial note for the borrowed token that will be completed by another party. This reduces the number of required transactions from 2 to 1.

### Private Refunds

Private transaction refunds from paymasters are the original inspiration for partial notes. Without partial notes, you have to claim your refund note. But the act of claiming itself needs gas! What if you overpaid fees on the refund tx? Then you have another 2nd order refund that you need to claim. This creates a never ending cycle! Partial notes allow paymasters to refund users without the user needing to claim the refund.

Before getting to partial notes let's recap what is the flow of standard notes.

## Note lifecycle recap

The standard note flow is as follows:

1. Create a note in your contract,
2. compute the note hash,
3. emit the note hash,
4. emit the note (note hash preimage) as an encrypted note log,
5. sequencer picks up the transaction, includes it in a block (note hash gets included in a note hash tree) and submits the block on-chain,
6. nodes and PXEs following the network pick up the new block, update its internal state and if they have accounts attached they search for relevant encrypted note logs,
7. if a users PXE finds a log it stores the note in its database,
8. later on when we want to spend a note, a contract obtains it via oracle and stores a note hash read request within the function context (note hash read request contains a newly computed note hash),
9. based on the note and a nullifier secret key a nullifier is computed and emitted,
10. protocol circuits check that the note is a valid note by checking that the note hash read request corresponds to a real note in the note hash tree and that the new nullifier does not yet exist in the nullifier tree,
11. if the conditions in point 10. are satisfied the nullifier is inserted into the nullifier tree and the note is at the end of its life.

Now let's do the same for partial notes.

## Partial notes life cycle

1. Create a partial/unfinished note in a private function of your contract --> partial here means that the values within the note are not yet considered finalized (e.g. `amount` in a `UintNote`),
2. compute a note hiding point of the partial note using a multi scalar multiplication on an elliptic curve. For `UintNote` this would be done as `G_amt * amount0 + G_npk * npk_m_hash + G_rnd * randomness + G_slot * slot`, where each `G_` is a generator point for a specific field in the note,
3. emit partial note log,
4. pass the note hiding point to a public function,
5. in a public function determine the value you want to add to the note (e.g. adding a value to an amount) and add it to the note hiding point (e.g. `NOTE_HIDING_POINT + G_amt * amount`),
6. get the note hash by finalizing the note hiding point (the note hash is the x coordinate of the point),
7. emit the note hash,
8. emit the value added to the note in public as an unencrypted log (PXE then matches it with encrypted partial note log emitted from private),
9. from this point on the flow of partial notes is the same as for normal notes.

### Private Fee Payment Example

Alice wants to use a fee-payment contract for fee abstraction, and wants to use private balances. That is, she wants to pay the FPC (fee-payment contract) some amount in an arbitrary token privately (e.g. a stablecoin), and have the FPC pay the `transaction_fee`.

Alice also wants to get her refund privately in the same token (e.g. the stablecoin).

The trouble is that the FPC doesn't know if Alice is going to run public functions, in which case it doesn't know what refund is due until the end of public execution.

And we can't use the normal flow to create a transaction fee refund note for Alice, since that demands we have Alice's address in public.

So we define a new type of note with its `compute_note_hiding_point` defined as:

$$
\text{amount}*G_{amount} + \text{address}*G_{address} + \text{randomness}*G_{randomness} + \text{slot}*G_{slot}
$$

Suppose Alice is willing to pay up to a set amount in stablecoins for her transaction. (Note, this amount gets passed into public so that when `transaction_fee` is known the FPC can verify that it isn't losing money. Wallets are expected to choose common values here, e.g. powers of 10).

Then we can subtract the set amount from Alice's balance of private stablecoins, and create a point in private like:

$$
P_a' := \text{alice address}*G_{address} + \text{rand}_a*G_{randomness} + \text{Alice note slot}*G_{slot}
$$

We also need to create a point for the owner of the FPC (whom we call Bob) to receive the transaction fee, which will also need randomness.

So in the contract we compute $\text{rand}_b := h(\text{rand}_a, \text{msg sender})$.

:::warning
We need to use different randomness for Bob's note here to avoid potential privacy leak (see [description](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/noir-contracts/contracts/token_contract/src/main.nr#L491) of `setup_refund` function)
:::

$$
P_b' := \text{bob address}*G_{address} + \text{rand}_b*G_{randomness} + \text{Bob note slot}*G_{slot}
$$

Here, the $P'$s "partially encode" the notes that we are _going to create_ for Alice and Bob. So we can use points as "Partial Notes".

We pass these points and the funded amount to public, and at the end of public execution, we compute tx fee point $P_{fee} := (\text{transaction fee}) * G_{amount}$ and refund point $P_{refund} := (\text{funded amount} - \text{transaction fee}) * G_{amount}$

Then, we arrive at the point that corresponds to the complete note by

$$
P_a := P_a'+P_{refund} = (\text{funded amount} - \text{transaction fee})*G_{amount} + \text{alice address}*G_{address} +\text{rand}_a*G_{randomness} + \text{Alice note slot}*G_{slot}
$$

$$
P_b := P_b'+P_{fee} = (\text{transaction fee})*G_{amount} + \text{bob address}*G_{address} +\text{rand}_b*G_{randomness} + \text{Bob note slot}*G_{slot}
$$

Then we just emit `P_a.x` and `P_b.x` as a note hashes, and we're done!

### Private Fee Payment Implementation

[`NoteInterface.nr`](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/aztec-nr/aztec/src/note/note_interface.nr) implements `compute_note_hiding_point`, which takes a note and computes the point "hides" it.

This is implemented by applying the `partial_note` attribute:

#include_code UintNote noir-projects/aztec-nr/uint-note/src/uint_note.nr rust

Those `G_x` are generators that generated [here](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/noir-projects/aztec-nr/aztec/src/generators.nr). Anyone can use them for separating different fields in a "partial note".

We can see the complete implementation of creating and completing partial notes in an Aztec contract in the `setup_refund` and `complete_refund` functions.

#### `setup_refund`

#include_code setup_refund noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

The `setup_refund` function sets the `complete_refund` function to be called at the end of the public function execution (`set_public_teardown_function`). This ensures that the partial notes will be completed and the fee payer will be paid and the user refund will be issued.

#### `complete_refund`

#include_code complete_refund noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

## Future work

This pattern of making public commitments to notes that can be modified by another party, privately, can be generalized to work with different kinds of applications. The Aztec labs team is working on adding libraries and tooling to make this easier to implement in your own contracts.
