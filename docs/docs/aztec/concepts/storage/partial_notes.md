---
title: Partial Notes
description: Describes how partial notes are used in Aztec
tags: [notes, storage]
---

Partial notes are a concept that allow users to commit to an encrypted value, and allow a counterparty to update that value without knowing the specific details of the encrypted value. To do this, we can leverage the homomorphic properties of the pedersen commitment.

Why is this useful?

Consider the case where a user wants to pay for a transaction fee, using a [fee-payment contract](../../../protocol-specs/gas-and-fees/index.md) and they want to do this privately. They can't be certain what the transaction fee will be because the state of the network will have progressed by the time the transaction is processed by the sequencer, and transaction fees are dynamic. So the user can commit to a value for the transaction fee, publicly post this commitment, the fee payer can update the public commitment, deducting the final cost of the transaction from the commitment and returning the unused value to the user.

So, in general, the user is:

- doing some computation in private
- encrypting/compressing that computation with a point
- passing that point as an argument to a public function

And the fee payer is:

- updating that point in public
- treating/emitting the result(s) as a note hash(es)

The idea of committing to a value and allowing a counterparty to update that value without knowing the specific details of the encrypted value is a powerful concept that can be used in many different applications. For example, this could be used for updating timestamp values in private, without revealing the exact timestamp, which could be useful for many defi applications.

## Private Fee Payment Example

Alice wants to use a fee-payment contract for fee abstraction, and wants to use private balances. That is, she wants to pay the FPC (fee-payment contract) some amount in an arbitrary token privately (e.g. bananas), and have the FPC pay the `transaction_fee`.

Alice also wants to get her refund privately in the same token (e.g. bananas).

The trouble is that the FPC doesn't know if Alice is going to run public functions, in which case it doesn't know what refund is due until the end of public execution.

And we can't use the normal flow to create a transaction fee refund note for Alice, since that demands we have Alice's address in public.

So we define a new type of note with its `compute_note_content_hash` defined as the x-coordinate of the following point:

$$
\text{amount}*G_{amount} + \text{address}*G_{address} + \text{randomness}*G_{randomness}
$$

Suppose Alice is willing to pay up to a set amount in bananas for her transaction. (Note, this amount gets passed into public so that when `transaction_fee` is known the FPC can verify that it isn't losing money. Wallets are expected to choose common values here, e.g. powers of 10).

Then we can subtract the set amount from Alice's balance of private bananas, and create a point in private like:

$$
P_a' := \text{funded amount}*G_{amount} + \text{alice address}*G_{address} + \text{rand}_a*G_{randomness}
$$

Where did that $\text{rand}_a$ come from? Well from Alice of course. So we can't trust it is random. So we hash it with Alice's address and emit it as a nullifier.

We also need to create a point for the owner of the FPC (whom we call Bob) to receive the transaction fee, which will also need randomness.

So we compute $\text{rand}_b := h(\text{rand}_a, \text{msg_sender})$, and emit that as a nullifier (to make sure it is unique) and as an unencrypted log (so Bob can recreate his refund note after the transaction).

$$
P_b' := \text{bob address}*G_{address} + \text{rand}_b*G_{randomness}
$$

Here, the $P'$s "partially encode" the notes that we are _going to create_ for Alice and Bob. So we can use points as "Partial Notes".

We pass these points to public, and at the end of public execution, we compute another point $P_{fee} := (\text{transaction fee}) * G_{amount}$.

Then, we arrive at the point that corresponds to the complete note by

$$
P_a := P_a'-P_{fee} = (\text{funded amount} - \text{transaction fee})*G_{amount} + \text{alice address}*G_{address} +\text{rand}_a*G_{randomness}
$$

$$
P_b := P_b'+P_{fee} = (\text{transaction fee})*G_{amount} + \text{bob address}*G_{address} +\text{rand}_b*G_{randomness}
$$

Then we just emit `P_a.x` and `P_b.x` as a note hashes in the proper slot, and we're done! Alice can reconstruct the expected note preimage since she knows the expected refund and randomness and add it to her PXE.

How do we know the proper slot? By storing all the notes in a `PrivateSet` as opposed to a `Map<AztecAddress, PrivateSet>`. So all the notes have the same storage slot.
See the very bottom of this doc for a link to a suggestion from Mike, that might enable the more familiar paradigm of mappings and storage slots.

### Private Fee Payment Implementation

[`NoteInterface.nr`](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/aztec-nr/aztec/src/note/note_interface.nr) implements `compute_note_hiding_point`, which takes a note and computes the point "hides" it.

This is implemented in the example token contract:

#include_code compute_note_hiding_point noir-projects/noir-contracts/contracts/token_contract/src/types/token_note.nr rust

Those `G_x` are generators that generated [here](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/noir-projects/aztec-nr/aztec/src/generators.nr). Anyone can use them for separating different fields in a "partial note".

We can see the complete implementation of creating and completing partial notes in an Aztec contract in the `setup_refund` and `complete_refund` functions.

#### `setup_refund`

#include_code setup_refund noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

The `setup_refund` function sets the `complete_refund` function to be called at the end of the public function execution (`set_public_teardown_function`). This ensures that the partial notes will be completed and the fee payer will be paid and the user refund will be issued.

#### `complete_refund`

#include_code complete_refund noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

## Future work

This pattern of making public commitments to notes that can be modified by another party, privately, can be generalized to work with different kinds of applications. The Aztec labs team is working on adding libraries and tooling to make this easier to implement in your own contracts.
