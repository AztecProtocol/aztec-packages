/// The purpose of this contract is to perform a check in public without revealing what contract enqued the public
/// call. This is achieved by having a private function on this contract that enques the public call and hence
/// the `msg_sender` in the public call is the address of this contract.
contract Router {
    use aztec::utils::comparison::assert_comparison;

    #[aztec(private)]
    fn check_timestamp(value: u64, operation: u8) {
        Router::at(context.this_address())._check_timestamp(value, operation).enqueue_view(&mut context);
    }

    #[aztec(public)]
    #[aztec(internal)]
    #[aztec(view)]
    fn _check_timestamp(value: u64, operation: u8) {
        let value_field = value as Field;
        let current_timestamp = context.timestamp() as Field;
        assert_comparison(
            value_field,
            operation,
            current_timestamp,
            "Timestamp mismatch."
        );
    }

    #[aztec(private)]
    fn check_block_number(value: Field, operation: u8) {
        Router::at(context.this_address())._check_block_number(value, operation).enqueue_view(&mut context);
    }

    #[aztec(public)]
    #[aztec(internal)]
    #[aztec(view)]
    fn _check_block_number(value: Field, operation: u8) {
        let current_block_number = context.block_number();
        assert_comparison(
            value,
            operation,
            current_block_number,
            "Block number mismatch."
        );
    }
}
