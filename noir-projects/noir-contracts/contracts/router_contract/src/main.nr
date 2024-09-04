/// The purpose of this contract is to perform a check in public without revealing what contract enqued the public
/// call. This is achieved by having a private function on this contract that enques the public call and hence
/// the `msg_sender` in the public call is the address of this contract.
contract Router {
    use aztec::utils::comparison::assert_comparison;

    /// Enqueues a public call that asserts that `lhs` (left side of the comparison) timestamp satisfies
    /// the `operation` with respect to the current timestamp.
    #[aztec(private)]
    fn check_timestamp(lhs: u64, operation: u8) {
        Router::at(context.this_address())._check_timestamp(lhs, operation).enqueue_view(&mut context);
    }

    #[aztec(public)]
    #[aztec(internal)]
    #[aztec(view)]
    fn _check_timestamp(lhs: u64, operation: u8) {
        let lhs_field = lhs as Field;
        let rhs = context.timestamp() as Field;
        assert_comparison(lhs_field, operation, rhs, "Timestamp mismatch.");
    }

    /// Enqueues a public call that asserts that `lhs` (left side of the comparison) block number satisfies
    /// the `operation` with respect to the current block number.
    #[aztec(private)]
    fn check_block_number(lhs: Field, operation: u8) {
        Router::at(context.this_address())._check_block_number(lhs, operation).enqueue_view(&mut context);
    }

    #[aztec(public)]
    #[aztec(internal)]
    #[aztec(view)]
    fn _check_block_number(lhs: Field, operation: u8) {
        let rhs = context.block_number();
        assert_comparison(lhs, operation, rhs, "Block number mismatch.");
    }
}
