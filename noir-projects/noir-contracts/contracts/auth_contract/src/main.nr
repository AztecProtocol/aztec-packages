contract Auth {
    use dep::aztec::protocol_types::address::AztecAddress;
    use dep::aztec::{
        log::{emit_unencrypted_log, emit_unencrypted_log_from_private},
        state_vars::{PublicImmutable, SharedMutable}
    };

    global CHANGE_AUTHORIZED_DELAY_BLOCKS = 5;

    struct Storage {
        admin: PublicImmutable<AztecAddress>,
        authorized: SharedMutable<AztecAddress, CHANGE_AUTHORIZED_DELAY_BLOCKS>, 
    }

    #[aztec(public)]
    #[aztec(initializer)]
    fn constructor(admin: AztecAddress) {
        assert(!admin.is_zero(), "invalid admin");
        storage.admin.initialize(admin);
    }

    #[aztec(public)]
    fn set_authorized(authorized: AztecAddress) {
        assert_eq(storage.admin.read(), context.msg_sender(), "caller is not admin");
        storage.authorized.schedule_value_change(authorized);
    }

    #[aztec(public)]
    fn get_authorized() {
        emit_unencrypted_log(
            &mut context,
            storage.authorized.get_current_value_in_public()
        );
    }

    #[aztec(public)]
    fn get_scheduled_authorized() {
        emit_unencrypted_log(
            &mut context,
            storage.authorized.get_scheduled_value_in_public()
        );
    }

    #[aztec(private)]
    fn do_private_authorized_thing(value: Field) {
        let authorized = storage.authorized.get_current_value_in_private();
        assert_eq(authorized, context.msg_sender(), "caller is not authorized");

        emit_unencrypted_log_from_private(&mut context, value);
    }
}
