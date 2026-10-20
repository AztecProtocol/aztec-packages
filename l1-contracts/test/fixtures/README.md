# Test fixtures

## Checkpoint fixtures

The checkpoint fixtures (`empty_checkpoint_{1,2}.json`, `single_tx_checkpoint_{1,2}.json`, `mixed_checkpoint_{1,2}.json`) come from aztec-node `yarn-project/sequencer-client/src/publisher/l1_publisher.integration.test.ts`. `test/base/DecoderBase.sol` loads them for the rollup tests.

To regenerate them, run the test in an aztec-node checkout with `AZTEC_GENERATE_TEST_DATA=1`. Without it, the test does not write any files. Set `AZTEC_L1_FIXTURES_DIR` to this directory, because aztec-node does not contain `l1-contracts`:

```bash
# from aztec-node yarn-project/
AZTEC_GENERATE_TEST_DATA=1 AZTEC_L1_FIXTURES_DIR=<aztec-packages>/l1-contracts/test/fixtures \
  yarn workspace @aztec-labs/sequencer-client test l1_publisher.integration
```

## Other generated fixtures

- `bn254_constants.json`: written by aztec-node `yarn-project/ethereum/src/test/bn254_registration.test.ts` when `AZTEC_GENERATE_TEST_DATA=1`. It writes to the fixed path `../../l1-contracts/test/fixtures/bn254_constants.json`, relative to the package directory. `AZTEC_L1_FIXTURES_DIR` does not change it.
- `bn254_pop_gas_vectors.json`: written by `scripts/bn254_pop_gas_model.py`. See [`test/shared/bn254-pop-gas/README.md`](../shared/bn254-pop-gas/README.md).
- `mainnet_atp_reduction_calculator.json`: written by `test/fork/MainnetReductionCalculator.t.sol` when `MAINNET_ATP_FIXTURE_RPC_URL` is set. Without it, the test loads this file.
