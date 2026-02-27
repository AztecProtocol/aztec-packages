// A private-only contract (no public functions) used to test initialization behavior when
// there is no public init nullifier. Tests verify that the private init nullifier alone is
// sufficient and that init checks work correctly for private-only contracts.
use aztec::macros::aztec;

#[aztec]
pub contract PrivateInitTest {
    use aztec::{
        macros::{functions::{external, initializer, noinitcheck}, storage::storage},
        messages::message_delivery::MessageDelivery,
        protocol::address::AztecAddress,
        state_vars::{Owned, PrivateMutable},
    };
    use field_note::FieldNote;

    #[storage]
    struct Storage<Context> {
        value: Owned<PrivateMutable<FieldNote, Context>, Context>,
    }

    #[initializer]
    #[external("private")]
    fn initialize(initial_value: Field) {
        let owner = self.msg_sender();
        self.storage.value.at(owner).initialize(FieldNote { value: initial_value }).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
    }

    #[external("private")]
    fn private_init_check_write_value(new_value: Field) {
        let owner = self.msg_sender();
        self.storage.value.at(owner).replace(|_old| FieldNote { value: new_value }).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
    }

    #[external("private")]
    #[noinitcheck]
    fn private_no_init_check_emit_nullifier(nullifier: Field) {
        self.context.push_nullifier(nullifier);
    }

    #[external("utility")]
    unconstrained fn utility_read_value(owner: AztecAddress) -> Field {
        self.storage.value.at(owner).view_note().value
    }
}
