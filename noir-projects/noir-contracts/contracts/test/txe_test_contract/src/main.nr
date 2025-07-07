mod test;
use dep::aztec::macros::aztec;

#[aztec]
pub contract TXETest {
    use aztec::macros::{functions::{initializer, private, public, utility, view}, storage::storage};
    use aztec::protocol_types::{
        abis::function_selector::FunctionSelector,
        address::AztecAddress,
        traits::{FromField, ToField},
    };
    use aztec::state_vars::Map;
    use easy_private_state::EasyPrivateUint;
    use value_note::{balance_utils, value_note::ValueNote};

    #[storage]
    struct Storage<Context> {
        counters: Map<AztecAddress, EasyPrivateUint<Context>, Context>,
    }

    #[initializer]
    #[private]
    fn initialize(headstart: u64, owner: AztecAddress) {
        let counters = storage.counters;
        counters.at(owner).add(headstart, owner, context.msg_sender());
    }

    #[private]
    fn increment(owner: AztecAddress, sender: AztecAddress) {
        unsafe {
            dep::aztec::oracle::debug_log::debug_log_format(
                "Incrementing counter for owner {0}",
                [owner.to_field()],
            );
        }

        TXETest::at(context.this_address()).emit_in_public(12345).enqueue(&mut context);

        let counters = storage.counters;
        counters.at(owner).add(1, owner, sender);
    }
    // docs:end:increment

    #[private]
    fn increment_twice(owner: AztecAddress, sender: AztecAddress) {
        unsafe {
            dep::aztec::oracle::debug_log::debug_log_format(
                "Incrementing counter twice for owner {0}",
                [owner.to_field()],
            );
        }
        let counters = storage.counters;
        counters.at(owner).add(1, owner, sender);
        counters.at(owner).add(1, owner, sender);
    }

    #[private]
    fn increment_and_decrement(owner: AztecAddress, sender: AztecAddress) {
        unsafe {
            dep::aztec::oracle::debug_log::debug_log_format(
                "Incrementing and decrementing counter for owner {0}",
                [owner.to_field()],
            );
        }
        let counters = storage.counters;
        counters.at(owner).add(1, owner, sender);
        counters.at(owner).sub(1, owner, sender);
    }

    #[private]
    fn decrement(owner: AztecAddress, sender: AztecAddress) {
        unsafe {
            dep::aztec::oracle::debug_log::debug_log_format(
                "Decrementing counter for owner {0}",
                [owner.to_field()],
            );
        }
        let counters = storage.counters;
        counters.at(owner).sub(1, owner, sender);
    }

    // docs:start:get_counter
    #[utility]
    unconstrained fn get_counter(owner: AztecAddress) -> Field {
        let counters = storage.counters;
        balance_utils::get_balance(counters.at(owner).set)
    }

    #[private]
    fn increment_self_and_other(
        other_counter: AztecAddress,
        owner: AztecAddress,
        sender: AztecAddress,
    ) {
        unsafe {
            dep::aztec::oracle::debug_log::debug_log_format(
                "Incrementing counter for other {0}",
                [owner.to_field()],
            );
        }

        let counters = storage.counters;
        counters.at(owner).add(1, owner, sender);

        TXETest::at(context.this_address()).emit_in_public(9876).enqueue(&mut context);
        TXETest::at(other_counter).increment(owner, sender).call(&mut context);
    }

    #[private]
    fn private_call(n: Field) -> Field {
        n
    }

    #[private]
    fn private_void_call(n: Field) {
        let _ = n;
    }

    #[private]
    #[view]
    fn private_static_call(n: Field) -> Field {
        n
    }

    #[private]
    #[view]
    fn private_static_void_call(n: Field) {
        let _ = n;
    }

    #[public]
    fn public_call(n: Field) -> Field {
        n
    }

    #[public]
    fn public_void_call(n: Field) {
        let _ = n;
    }

    #[public]
    #[view]
    fn public_static_call(n: Field) -> Field {
        n
    }

    #[public]
    #[view]
    fn public_static_void_call(n: Field) {
        let _ = n;
    }

    #[utility]
    unconstrained fn utility_simulate(n: Field) -> pub Field {
        n
    }

    #[utility]
    unconstrained fn utility_void_simulate(n: Field) {
        let _ = n;
    }

    #[public]
    fn emit_in_public(n: Field) {
        context.push_note_hash(n);
    }

    #[public]
    fn return_public(n: Field) -> Field {
        n
    }
}
