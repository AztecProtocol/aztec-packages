contract RouterContract {
    use dep::aztec::note::note_getter_options::Comparator;

    #[aztec(private)]
    fn check_timestamp(operation: u8, value: u64) {
        RouterContract::at(context.this_address())._check_timestamp(operation, value).enqueue(&mut context);
    }

    #[aztec(public)]
    #[aztec(internal)]
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
}
