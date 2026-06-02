// Demonstrates nested utility calls by implementing pow_utility(x, n) = x^n recursively,
// and calling it from a private function via pow_private.

use aztec::macros::aztec;

mod pow_note;
mod test;

#[aztec]
pub contract NestedUtility {
    use crate::pow_note::PowNote;
    use aztec::macros::{functions::{external, view}, storage::storage};
    use aztec::{
        messages::message_delivery::MessageDelivery,
        protocol::address::AztecAddress,
        state_vars::{Owned, PrivateMutable},
    };

    #[storage]
    struct Storage<Context> {
        pow_args: Owned<PrivateMutable<PowNote, Context>, Context>,
    }

    #[external("utility")]
    unconstrained fn pow_utility(x: Field, n: u32) -> Field {
        if n == 0 {
            1
        } else {
            x * self.call_self.pow_utility(x, n - 1)
        }
    }

    #[external("utility")]
    unconstrained fn delegate_pow_utility(target: AztecAddress, x: Field, n: u32) -> Field {
        self.call(NestedUtility::at(target).pow_utility(x, n))
    }

    /// Stores the base and exponent for pow in a private note.
    #[external("private")]
    fn set_pow_args(x: Field, n: Field) {
        let owner = self.msg_sender();
        self.storage.pow_args.at(owner).initialize_or_replace(|_| PowNote { x, n }).deliver(
            MessageDelivery::onchain_constrained(),
        );
    }

    /// Reads x and n from storage and computes x^n.
    #[external("utility")]
    unconstrained fn pow_from_storage(owner: AztecAddress) -> Field {
        let note = self.storage.pow_args.at(owner).view_note();
        self.call_self.pow_utility(note.x, note.n as u32)
    }

    /// Cross-contract version: calls pow_from_storage on the target contract.
    #[external("utility")]
    unconstrained fn delegate_pow_from_storage(target: AztecAddress, owner: AztecAddress) -> Field {
        self.call(NestedUtility::at(target).pow_from_storage(owner))
    }

    #[external("private")]
    fn pow_private(x: Field, n: u32) -> Field {
        // Safety: this is a test contract; the unconstrained result is returned directly
        // and never used as input to a constrained assertion
        unsafe {
            self.utility.call_self.pow_utility(x, n)
        }
    }

    #[external("private")]
    fn delegate_pow_private(target: AztecAddress, x: Field, n: u32) -> Field {
        // Safety: this is a test contract; the unconstrained result is returned directly
        // and never used as input to a constrained assertion
        unsafe {
            self.utility.call(NestedUtility::at(target).pow_utility(x, n))
        }
    }

    #[view]
    #[external("private")]
    fn delegate_pow_view(target: AztecAddress, x: Field, n: u32) -> Field {
        // Safety: this is a test contract; the unconstrained result is returned directly
        // and never used as input to a constrained assertion
        unsafe {
            self.utility.call(NestedUtility::at(target).pow_utility(x, n))
        }
    }
}
