import { updateInlineTestData } from '@aztec/foundation/testing';
import { type Writeable } from '@aztec/foundation/types';

import { Fr, Gas, GasFees, GasSettings } from '../structs/index.js';
import { computeTransactionFee } from './transaction_fee.js';

describe('computeTransactionFee', () => {
  let gasFees: GasFees;
  let gasSettings: Writeable<GasSettings>;
  let gasUsed: Gas;

  const expectFee = (feeStr: string) => {
    const fee = computeTransactionFee(gasFees, gasSettings, gasUsed);
    expect(fee).toEqual(new Fr(BigInt(eval(feeStr))));
  };

  beforeEach(() => {
    gasFees = new GasFees(12, 34);

    const maxFeesPerGas = new GasFees(56, 78);
    const maxPriorityFeesPerGas = new GasFees(5, 7);
    gasSettings = GasSettings.from({ ...GasSettings.empty(), maxFeesPerGas, maxPriorityFeesPerGas });

    gasUsed = new Gas(2, 3);
  });

  it('computes the transaction fee with priority fee', () => {
    const feeStr = '2 * (12 + 5) + 3 * (34 + 7)';
    expectFee(feeStr);

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/base/components/private_base_rollup_output_composer/compute_transaction_fee.nr',
      'expected_fee',
      feeStr,
    );
  });

  it('computes the transaction fee without priority fee', () => {
    gasSettings.maxPriorityFeesPerGas = GasFees.empty();

    const feeStr = '2 * 12 + 3 * 34';
    expectFee(feeStr);

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/base/components/private_base_rollup_output_composer/compute_transaction_fee.nr',
      'expected_fee_empty_priority',
      feeStr,
    );
  });

  it('computes the transaction fee paying max fee', () => {
    // Increase gas_fees so that gasFees + maxPriorityFeesPerGas > maxFeesPerGas.
    gasFees = new GasFees(53, 74);

    const feeStr = '2 * 56 + 3 * 78';
    expectFee(feeStr);

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/rollup-lib/src/base/components/private_base_rollup_output_composer/compute_transaction_fee.nr',
      'expected_max_fee',
      feeStr,
    );
  });
});
