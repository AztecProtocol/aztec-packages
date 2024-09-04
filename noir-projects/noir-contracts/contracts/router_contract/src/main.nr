/// The purpose of this contract is to perform a check in public without revealing what contract enqued the public
/// call. This is achieved by having a private function on this contract that enques the public call and hence
/// the `msg_sender` in the public call is the address of this contract.
contract Router {
    use dep::aztec::note::note_getter_options::Comparator;

    #[aztec(private)]
    fn check_timestamp(operation: u8, value: u64) {
        Router::at(context.this_address())._check_timestamp(operation, value).enqueue_view(&mut context);
    }

    #[aztec(public)]
    #[aztec(internal)]
    #[aztec(view)]
    fn _check_timestamp(operation: u8, value: u64) {
        let current_timestamp = context.timestamp();

        // Values are computed ahead of time because circuits evaluate all branches
        let is_equal = value == current_timestamp;
        let is_lt = value < current_timestamp;

        if (operation == Comparator.EQ) {
            assert(is_equal, "Timestamp mismatch.");
        } else if (operation == Comparator.NEQ) {
            assert(!is_equal, "Timestamp mismatch.");
        } else if (operation == Comparator.LT) {
            assert(is_lt, "Timestamp mismatch.");
        } else if (operation == Comparator.LTE) {
            assert(is_lt | is_equal, "Timestamp mismatch.");
        } else if (operation == Comparator.GT) {
            assert(!is_lt & !is_equal, "Timestamp mismatch.");
        } else if (operation == Comparator.GTE) {
            assert(!is_lt, "Timestamp mismatch.");
        }
    }

    #[aztec(private)]
    fn check_block_number(operation: u8, value: Field) {
        Router::at(context.this_address())._check_block_number(operation, value).enqueue_view(&mut context);
    }

    #[aztec(public)]
    #[aztec(internal)]
    #[aztec(view)]
    fn _check_block_number(operation: u8, value: Field) {
        let current_block_number = context.block_number();

        // Values are computed ahead of time because circuits evaluate all branches
        let is_equal = value == current_block_number;
        // TODO(#5345): represent block number everywhere as u32?
        let is_lt = value as u32 < current_block_number as u32;

        if operation == Comparator.EQ {
            assert(is_equal, "Block number mismatch.");
        } else if operation == Comparator.NEQ {
            assert(!is_equal, "Block number mismatch.");
        } else if operation == Comparator.LT {
            assert(is_lt, "Block number mismatch.");
        } else if operation == Comparator.LTE {
            assert(is_lt | is_equal, "Block number mismatch.");
        } else if operation == Comparator.GT {
            assert(!is_lt & !is_equal, "Block number mismatch.");
        } else if operation == Comparator.GTE {
            assert(!is_lt, "Block number mismatch.");
        }
    }
}
