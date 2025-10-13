mod test;

// Test contract showing basic public access control that can be used in private. It uses a DelayedPublicMutable state variable to
// publicly store the address of an authorized account that can call private functions.
use dep::aztec::macros::aztec;

#[aztec]
pub contract Auth {
    use dep::aztec::{
        macros::{functions::{initializer, private, public, view}, storage::storage},
        protocol_types::address::AztecAddress,
        state_vars::{DelayedPublicMutable, PublicImmutable},
    };

    // Authorizing a new address has a certain delay before it goes into effect. Set to 180 seconds which is 5 slots.
    pub(crate) global CHANGE_AUTHORIZED_DELAY: u64 = 180;

    #[storage]
    struct Storage<Context> {
        // Admin can change the value of the authorized address via set_authorized()
        admin: PublicImmutable<AztecAddress, Context>,
        authorized: DelayedPublicMutable<AztecAddress, CHANGE_AUTHORIZED_DELAY, Context>,
    }

    #[public]
    #[initializer]
    fn constructor(admin: AztecAddress) {
        assert(!admin.is_zero(), "invalid admin");
        storage.admin.initialize(admin);
    }

    #[public]
    fn set_authorized(authorized: AztecAddress) {
        assert_eq(storage.admin.read(), context.msg_sender(), "caller is not admin");
        storage.authorized.schedule_value_change(authorized);
    }

    // docs:start:public_getter
    #[public]
    #[view]
    fn get_authorized() -> AztecAddress {
        storage.authorized.get_current_value()
    }
    // docs:end:public_getter

    #[public]
    #[view]
    fn get_scheduled_authorized() -> (AztecAddress, u64) {
        storage.authorized.get_scheduled_value()
    }

    #[public]
    #[view]
    fn get_authorized_delay() -> pub u64 {
        storage.authorized.get_current_delay()
    }

    #[public]
    fn set_authorized_delay(new_delay: u64) {
        storage.authorized.schedule_delay_change(new_delay);
    }

    #[private]
    fn do_private_authorized_thing() {
        // Reading a value from authorized in private automatically adds an extra validity condition: the base rollup
        // circuit will reject this tx if timestamp of the block being built is past the time horizon of
        // the DelayedPublicMutable, which is as far as the circuit can guarantee the value will not change from some
        // historical value (due to CHANGE_AUTHORIZED_DELAY).
        let authorized = storage.authorized.get_current_value();
        assert_eq(authorized, context.msg_sender(), "caller is not authorized");
    }

    #[private]
    #[view]
    fn get_authorized_in_private() -> AztecAddress {
        storage.authorized.get_current_value()
    }
}
