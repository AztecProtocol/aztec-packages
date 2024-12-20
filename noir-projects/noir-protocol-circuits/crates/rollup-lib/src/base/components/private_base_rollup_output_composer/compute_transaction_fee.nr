use types::abis::{gas::Gas, gas_fees::GasFees, gas_settings::GasSettings};

pub fn compute_transaction_fee(
    gas_fees: GasFees,
    gas_settings: GasSettings,
    gas_used: Gas,
) -> Field {
    let max_priority_fees = gas_settings.max_priority_fees_per_gas;
    let max_fees = gas_settings.max_fees_per_gas;
    // max_fees are guaranteed to be greater than or equal to gas_fees, which is checked in tube_data_validator.
    let priority_fees = GasFees::new(
        dep::types::utils::field::min(
            max_priority_fees.fee_per_da_gas,
            max_fees.fee_per_da_gas - gas_fees.fee_per_da_gas,
        ),
        dep::types::utils::field::min(
            max_priority_fees.fee_per_l2_gas,
            max_fees.fee_per_l2_gas - gas_fees.fee_per_l2_gas,
        ),
    );

    let total_fees = GasFees::new(
        gas_fees.fee_per_da_gas + priority_fees.fee_per_da_gas,
        gas_fees.fee_per_l2_gas + priority_fees.fee_per_l2_gas,
    );

    gas_used.compute_fee(total_fees)
}

mod tests {
    use super::compute_transaction_fee;
    use types::abis::{gas::Gas, gas_fees::GasFees, gas_settings::GasSettings};

    struct TestBuilder {
        gas_fees: GasFees,
        gas_settings: GasSettings,
        gas_used: Gas,
    }

    impl TestBuilder {
        pub fn new() -> Self {
            let gas_fees = GasFees::new(12, 34);

            let mut gas_settings = GasSettings::empty();
            gas_settings.max_fees_per_gas = GasFees::new(56, 78);
            gas_settings.max_priority_fees_per_gas = GasFees::new(5, 7);

            let gas_used = Gas::new(2, 3);

            TestBuilder { gas_fees, gas_settings, gas_used }
        }

        pub fn compute(self) -> Field {
            compute_transaction_fee(self.gas_fees, self.gas_settings, self.gas_used)
        }
    }

    #[test]
    fn compute_transaction_fee_default() {
        let builder = TestBuilder::new();
        let fee = builder.compute();

        // Make sure the following value matches the one in `transaction_fee.test.ts` in `circuits.js`.
        // Paying gas_fees + max_priority_fees.
        let expected_fee = 2 * (12 + 5) + 3 * (34 + 7);
        assert_eq(fee, expected_fee);
    }

    #[test]
    fn compute_transaction_fee_zero_priority_fees() {
        let mut builder = TestBuilder::new();

        builder.gas_settings.max_priority_fees_per_gas = GasFees::empty();

        let fee = builder.compute();

        // Make sure the following value matches the one in `transaction_fee.test.ts` in `circuits.js`.
        // Paying gas_fees only.
        let expected_fee_empty_priority = 2 * 12 + 3 * 34;
        assert_eq(fee, expected_fee_empty_priority);
    }

    #[test]
    fn compute_transaction_fee_capped_max_fees() {
        let mut builder = TestBuilder::new();

        // Increase gas_fees so that gas_fees + max_priority_fees > max_fees.
        builder.gas_fees = GasFees::new(53, 74);

        let fee = builder.compute();

        // Make sure the following value matches the one in `transaction_fee.test.ts` in `circuits.js`.
        // max_fees were applied.
        let expected_max_fee = 2 * 56 + 3 * 78;
        assert_eq(fee, expected_max_fee);
    }
}
