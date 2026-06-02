#![no_std]
extern crate alloc;

pub mod minimal;
pub mod token_transfer;
pub mod private_swap;
pub mod heavy;
pub mod kernel_heavy;
pub mod merkle_fixtures;
pub mod runner;
pub mod runner_inline;

// Realistic Aztec transaction flows:
//
// A typical private tx has this call tree structure:
//
//   account_entrypoint (verifies signature, dispatches calls)
//   ├─ SETUP PHASE (non-revertible):
//   │   └─ fpc.fee_entrypoint_private(max_fee, nonce)
//   │       ├─ token.transfer_to_public(sender, fpc, max_fee, nonce)
//   │       │   └─ account.verify_private_authwit(inner_hash)
//   │       │       └─ emits: 1 authwit nullifier
//   │       ├─ token.prepare_private_balance_increase(sender) → partial_note
//   │       ├─ context.set_as_fee_payer()
//   │       └─ context.end_setup()  ← REVERTIBILITY BOUNDARY
//   │
//   └─ APP PHASE (revertible):
//       └─ token.transfer(sender, recipient, amount)
//           ├─ subtract_balance(sender, amount)
//           │   └─ emits: N nullifiers (one per balance note consumed)
//           │              1 note hash (change note)
//           └─ emits: 1 note hash (recipient note)
//                     1 private log (transfer event)
//
// The test contracts below model this structure. Each "function" is a Rust
// function that takes a PrivateContext and emits the appropriate side effects.
// The functions are composed into call trees via nested ExecutionResults.
