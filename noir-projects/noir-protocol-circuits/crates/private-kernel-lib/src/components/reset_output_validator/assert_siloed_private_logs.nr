use dep::types::{
    abis::{private_log::PrivateLogData, side_effect::scoped::Scoped},
    constants::PRIVATE_LOG_SIZE_IN_FIELDS,
    hash::mask_private_log_address,
    traits::is_empty,
    utils::arrays::find_index_hint,
};

unconstrained fn find_siloed_private_log_index<let PRIVATE_LOG_SILOING_AMOUNT: u32>(
    siloed_private_log_indexes: [u32; PRIVATE_LOG_SILOING_AMOUNT],
    log_index: u32,
) -> u32 {
    let index = find_index_hint(siloed_private_log_indexes, |index: u32| index == log_index);
    if index == PRIVATE_LOG_SILOING_AMOUNT {
        0
    } else {
        index
    }
}

pub fn assert_siloed_private_logs<let NUM_LOGS: u32, let PRIVATE_LOG_SILOING_AMOUNT: u32>(
    from_logs: [Scoped<PrivateLogData>; NUM_LOGS],
    to_logs: [Scoped<PrivateLogData>; NUM_LOGS],
    siloed_private_log_indexes: [u32; PRIVATE_LOG_SILOING_AMOUNT],
) {
    // Verify that siloed logs have the correct mask address padded to the end.
    for i in 0..siloed_private_log_indexes.len() {
        let index = siloed_private_log_indexes[i];
        let from_log = from_logs[index];
        let to_log = to_logs[index];
        if from_log.inner.note_hash_counter == 0 {
            let last_field = to_log.inner.log.fields[PRIVATE_LOG_SIZE_IN_FIELDS - 1];
            let masked_address = if !is_empty(from_log.contract_address) {
                mask_private_log_address(from_log.contract_address, from_log.inner.randomness)
            } else {
                // If contract_address is empty, the last field has been checked before.
                last_field
            };
            assert_eq(
                last_field,
                masked_address,
                "private log not linked to a note hash must be padded with masked address",
            );
            assert(
                is_empty(to_log.contract_address),
                "contract address of a verified private log must be cleared",
            );
        } else {
            assert_eq(
                from_log.contract_address,
                to_log.contract_address,
                "wrong propagated contract address for note log",
            );
        }
    }

    // Verify that all the logs are either propagated without any values changed or siloed above (contract_address set to 0).
    for i in 0..from_logs.len() {
        let from_log = from_logs[i];
        let to_log = to_logs[i];
        assert_eq(from_log.inner, to_log.inner, "mismatch propagated private log data");

        // The contract address is either:
        // - propagated
        let address_propagated = from_log.contract_address == to_log.contract_address;
        // - or checked in the previous step. In this case, the log index would appear in siloed_private_log_indexes.
        let index_hint = unsafe { find_siloed_private_log_index(siloed_private_log_indexes, i) };
        let log_index = siloed_private_log_indexes[index_hint];
        // Check that at least one of the above conditions is true.
        // If both are true, it means that the masked address is checked, but the contract address is still propagated to the output log.
        // It makes this run of validation wasted. The reset circuit will have to be run again to clear the address.
        // Otherwise, the check will fail in previous_kernel_validator > validate_sorted_siloed_values.
        assert(
            address_propagated | (log_index == i),
            "wrong propagated contract address for private log",
        );
    }
}

mod tests {
    use crate::components::reset_output_validator::assert_siloed_private_logs::assert_siloed_private_logs;
    use dep::types::{
        abis::{private_log::{PrivateLog, PrivateLogData}, side_effect::scoped::Scoped},
        address::AztecAddress,
        constants::PRIVATE_LOG_SIZE_IN_FIELDS,
        hash::mask_private_log_address,
    };

    global NUM_LOGS = 5;
    global PRIVATE_LOG_SILOING_AMOUNT = 3;
    global contract_address = AztecAddress::from_field(987654);
    global another_contract_address = AztecAddress::from_field(456789);
    global randomness: Field = 123456;

    fn mock_log(filled_with: Field, masked: bool) -> Scoped<PrivateLogData> {
        let mut log = PrivateLog::new([filled_with; PRIVATE_LOG_SIZE_IN_FIELDS]);
        if (masked) {
            log.fields[PRIVATE_LOG_SIZE_IN_FIELDS - 1] =
                mask_private_log_address(contract_address, randomness);
        }
        PrivateLogData { log, counter: filled_with as u32, randomness, note_hash_counter: 0 }.scope(
            contract_address,
        )
    }

    struct TestBuilder {
        from_logs: [Scoped<PrivateLogData>; NUM_LOGS],
        to_logs: [Scoped<PrivateLogData>; NUM_LOGS],
        siloed_private_log_indexes: [u32; PRIVATE_LOG_SILOING_AMOUNT],
    }

    impl TestBuilder {
        pub fn new() -> Self {
            let mut note_log = mock_log(11, false);
            note_log.inner.note_hash_counter = 1;

            let log_with_masked_address_1 = mock_log(22, true);

            let mut note_log_with_masked_address = mock_log(33, true);
            note_log_with_masked_address.inner.note_hash_counter = 2;

            let log_with_masked_address_2 = mock_log(44, true);

            let from_logs = [
                note_log,
                log_with_masked_address_1,
                note_log_with_masked_address,
                log_with_masked_address_2,
                Scoped::empty(),
            ];

            let mut to_logs = from_logs;
            to_logs[1].contract_address = AztecAddress::zero();

            let mut siloed_private_log_indexes = [0; PRIVATE_LOG_SILOING_AMOUNT];
            siloed_private_log_indexes[0] = 1;

            Self { from_logs, to_logs, siloed_private_log_indexes }
        }

        pub fn execute(self) {
            assert_siloed_private_logs(
                self.from_logs,
                self.to_logs,
                self.siloed_private_log_indexes,
            );
        }
    }

    #[test]
    fn assert_siloed_private_logs_succeeds() {
        let builder = TestBuilder::new();
        builder.execute();
    }

    ////////////////////////////////////
    // Log with Masked Address
    ////////////////////////////////////

    #[test(should_fail_with = "private log not linked to a note hash must be padded with masked address")]
    fn assert_siloed_private_logs_wrong_masked_address_fails() {
        let mut builder = TestBuilder::new();

        builder.from_logs[1].inner.log.fields[PRIVATE_LOG_SIZE_IN_FIELDS - 1] += 1;
        builder.to_logs[1].inner.log.fields[PRIVATE_LOG_SIZE_IN_FIELDS - 1] += 1;

        builder.execute();
    }

    #[test(should_fail_with = "private log not linked to a note hash must be padded with masked address")]
    fn assert_siloed_private_logs_to_log_wrong_masked_address_fails() {
        let mut builder = TestBuilder::new();

        builder.to_logs[1].inner.log.fields[PRIVATE_LOG_SIZE_IN_FIELDS - 1] += 1;

        builder.execute();
    }

    #[test(should_fail_with = "mismatch propagated private log data")]
    fn assert_siloed_private_logs_from_log_wrong_from_masked_address_fails() {
        let mut builder = TestBuilder::new();

        builder.from_logs[1].inner.log.fields[PRIVATE_LOG_SIZE_IN_FIELDS - 1] += 1;

        builder.execute();
    }

    #[test(should_fail_with = "private log not linked to a note hash must be padded with masked address")]
    fn assert_siloed_private_logs_to_log_another_masked_address_fails() {
        let mut builder = TestBuilder::new();

        builder.to_logs[1].contract_address = another_contract_address;
        builder.to_logs[1].inner.log.fields[PRIVATE_LOG_SIZE_IN_FIELDS - 1] =
            mask_private_log_address(another_contract_address, randomness);

        builder.execute();
    }

    #[test(should_fail_with = "mismatch propagated private log data")]
    fn assert_siloed_private_logs_from_log_another_masked_address_fails() {
        let mut builder = TestBuilder::new();

        builder.from_logs[1].contract_address = another_contract_address;
        builder.to_logs[1].inner.log.fields[PRIVATE_LOG_SIZE_IN_FIELDS - 1] =
            mask_private_log_address(another_contract_address, randomness);

        builder.execute();
    }

    #[test]
    fn assert_siloed_private_logs_squash_two_logs_succeeds() {
        let mut builder = TestBuilder::new();

        builder.to_logs[3].contract_address = AztecAddress::zero();
        builder.siloed_private_log_indexes[1] = 3;

        builder.execute();
    }

    #[test(should_fail_with = "wrong propagated contract address for private log")]
    fn assert_siloed_private_logs_squash_two_logs_not_in_hints_fails() {
        let mut builder = TestBuilder::new();

        builder.to_logs[3].contract_address = AztecAddress::zero();

        builder.execute();
    }

    ////////////////////////////////////
    // Note Log
    ////////////////////////////////////

    #[test(should_fail_with = "wrong propagated contract address for note log")]
    fn assert_siloed_private_logs_note_log_wrong_address_fails() {
        let mut builder = TestBuilder::new();

        builder.from_logs[0].contract_address = another_contract_address;

        builder.execute();
    }

    #[test(should_fail_with = "wrong propagated contract address for note log")]
    fn assert_siloed_private_logs_to_note_log_wrong_address_fails() {
        let mut builder = TestBuilder::new();

        builder.to_logs[0].contract_address = another_contract_address;

        builder.execute();
    }

    ////////////////////////////////////
    // Note Log with Masked Address
    ////////////////////////////////////

    #[test]
    fn assert_siloed_private_logs_note_log_wrong_masked_address_succeeds() {
        let mut builder = TestBuilder::new();

        // Log at index 2 is a note log with masked address.
        // Because it's linked to a note hash (note_hash_counter != 0), its last field is not checked.
        builder.from_logs[2].inner.log.fields[PRIVATE_LOG_SIZE_IN_FIELDS - 1] += 1;
        builder.to_logs[2].inner.log.fields[PRIVATE_LOG_SIZE_IN_FIELDS - 1] += 1;

        builder.execute();
    }
}
