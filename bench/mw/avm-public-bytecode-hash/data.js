window.BENCHMARK_DATA = {
  "lastUpdate": 1770647364934,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "Aztec Benchmarks": [
      {
        "commit": {
          "author": {
            "name": "AztecProtocol",
            "username": "AztecProtocol"
          },
          "committer": {
            "name": "AztecProtocol",
            "username": "AztecProtocol"
          },
          "id": "9652497d56778296731ec12fa71f6fb45aba0ed4",
          "message": "fix(avm)!: Enshrine bytecode size in public bytecode commitment - ts/nr/fixtures",
          "timestamp": "2026-02-09T12:24:08Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/20286/commits/9652497d56778296731ec12fa71f6fb45aba0ed4"
        },
        "date": 1770647362892,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/ultra_honk_zk/seconds",
            "value": 18029.192018,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/ultra_honk_zk/memory",
            "value": "1632",
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/chonk/seconds",
            "value": 39422.67258200001,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/chonk/memory",
            "value": "1188",
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/ultra_honk/seconds",
            "value": 15839.512252999999,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/ultra_honk/memory",
            "value": "1452",
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/ultra_honk_zk/seconds",
            "value": 7236.880893000034,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/ultra_honk_zk/memory",
            "value": "1522",
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/chonk/seconds",
            "value": 14934.043255999995,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/chonk/memory",
            "value": "727",
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/ultra_honk/seconds",
            "value": 6410.820970000032,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/ultra_honk/memory",
            "value": "1329",
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/chonk_verify/seconds",
            "value": 208.47776699997667,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/chonk_verify/memory",
            "value": "741",
            "unit": "MB"
          },
          {
            "name": "l1-contracts/alpha/no_validators/gasPerSecond",
            "value": 6759.3,
            "unit": "gas/second"
          },
          {
            "name": "l1-contracts/alpha/no_validators/propose",
            "value": 197421,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/alpha/no_validators/setupEpoch",
            "value": 31986,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/alpha/no_validators/submitEpochRootProof",
            "value": 718638,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/alpha/validators/gasPerSecond",
            "value": 10683.9,
            "unit": "gas/second"
          },
          {
            "name": "l1-contracts/alpha/validators/propose",
            "value": 325176,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/alpha/validators/proposeAndVote",
            "value": 373884,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/alpha/validators/setupEpoch",
            "value": 46448,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/alpha/validators/submitEpochRootProof",
            "value": 927861,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/ignition/no_validators/gasPerSecond",
            "value": 919.2,
            "unit": "gas/second"
          },
          {
            "name": "l1-contracts/ignition/no_validators/propose",
            "value": 152324,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/ignition/no_validators/setupEpoch",
            "value": 31304,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/ignition/no_validators/submitEpochRootProof",
            "value": 564469,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/ignition/validators/gasPerSecond",
            "value": 1344.9,
            "unit": "gas/second"
          },
          {
            "name": "l1-contracts/ignition/validators/propose",
            "value": 229239,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/ignition/validators/proposeAndVote",
            "value": 277776,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/ignition/validators/setupEpoch",
            "value": 36772,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/ignition/validators/submitEpochRootProof",
            "value": 677227,
            "unit": "gas"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_64_4_opcodes",
            "value": 44546,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_64_4_gates",
            "value": 225546,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_tail_to_public_opcodes",
            "value": 36645,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_tail_to_public_gates",
            "value": 92826,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_4_4_4_4_4_4_4_4_4_opcodes",
            "value": 29586,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_4_4_4_4_4_4_4_4_4_gates",
            "value": 114499,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_checkpoint_padding_opcodes",
            "value": 197,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_checkpoint_padding_gates",
            "value": 4008,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_4_64_opcodes",
            "value": 41882,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_4_64_gates",
            "value": 173604,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_64_opcodes",
            "value": 47486,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_64_gates",
            "value": 222381,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_4_opcodes",
            "value": 41222,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_4_gates",
            "value": 183579,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_4_opcodes",
            "value": 35434,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_4_gates",
            "value": 133694,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_4_opcodes",
            "value": 42266,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_4_gates",
            "value": 218736,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_checkpoint_root_single_block_opcodes",
            "value": 1831644,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_checkpoint_root_single_block_gates",
            "value": 6658193,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_4_opcodes",
            "value": 35878,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_4_gates",
            "value": 159686,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_merge_opcodes",
            "value": 1311,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_merge_gates",
            "value": 1580909,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_root_opcodes",
            "value": 2464,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_root_gates",
            "value": 13009481,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_64_4_opcodes",
            "value": 38158,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_64_4_gates",
            "value": 166496,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_64_opcodes",
            "value": 46858,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_64_gates",
            "value": 195281,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_4_opcodes",
            "value": 38342,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_4_gates",
            "value": 167604,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_single_tx_opcodes",
            "value": 969,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_single_tx_gates",
            "value": 735972,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_32_32_32_32_32_32_32_32_opcodes",
            "value": 56145,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_32_32_32_32_32_32_32_32_gates",
            "value": 355958,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_4_opcodes",
            "value": 39386,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_4_gates",
            "value": 202761,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_first_single_tx_opcodes",
            "value": 1267,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_first_single_tx_gates",
            "value": 1529726,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_64_opcodes",
            "value": 47042,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_64_gates",
            "value": 196389,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_64_0_0_0_0_0_0_opcodes",
            "value": 22270,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_64_0_0_0_0_0_0_gates",
            "value": 64145,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_64_0_0_0_0_0_0_0_0_opcodes",
            "value": 22270,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_64_0_0_0_0_0_0_0_0_gates",
            "value": 64145,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_tx_base_private_opcodes",
            "value": 302271,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_tx_base_private_gates",
            "value": 3954635,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_64_opcodes",
            "value": 44162,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_64_gates",
            "value": 180414,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_init_opcodes",
            "value": 8913,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_init_gates",
            "value": 47523,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/chonk_verifier_public_opcodes",
            "value": 3263,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/chonk_verifier_public_gates",
            "value": 2487645,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_tx_merge_opcodes",
            "value": 1304,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_tx_merge_gates",
            "value": 1580612,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_first_opcodes",
            "value": 2469,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_first_gates",
            "value": 2380949,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_4_4_opcodes",
            "value": 36062,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_4_4_gates",
            "value": 160794,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_16_16_16_16_16_16_16_16_16_opcodes",
            "value": 40978,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_16_16_16_16_16_16_16_16_16_gates",
            "value": 217991,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_4_opcodes",
            "value": 32554,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_4_gates",
            "value": 117719,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_64_4_opcodes",
            "value": 37714,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_64_4_gates",
            "value": 140504,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_64_opcodes",
            "value": 45206,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_64_gates",
            "value": 215571,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/parity_base_opcodes",
            "value": 250935,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/parity_base_gates",
            "value": 2274397,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_64_opcodes",
            "value": 38374,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_64_gates",
            "value": 130529,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_0_0_64_0_0_0_opcodes",
            "value": 32036,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_0_0_64_0_0_0_gates",
            "value": 83772,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_4_opcodes",
            "value": 41666,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_4_gates",
            "value": 209571,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_64_64_opcodes",
            "value": 50366,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_64_64_gates",
            "value": 238356,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_64_0_0_0_0_0_0_0_opcodes",
            "value": 36601,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_64_0_0_0_0_0_0_0_gates",
            "value": 284191,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_opcodes",
            "value": 86565,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_gates",
            "value": 631978,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_64_opcodes",
            "value": 48086,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_64_gates",
            "value": 231546,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/ts_types_opcodes",
            "value": 109,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/ts_types_gates",
            "value": 3006,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_checkpoint_root_opcodes",
            "value": 1832840,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_checkpoint_root_gates",
            "value": 7509583,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_64_64_opcodes",
            "value": 43978,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_64_64_gates",
            "value": 179306,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_opcodes",
            "value": 2173,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_gates",
            "value": 1587196,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_4_opcodes",
            "value": 38942,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_4_gates",
            "value": 176769,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_4_opcodes",
            "value": 41038,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_4_gates",
            "value": 182471,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_64_opcodes",
            "value": 40654,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_64_gates",
            "value": 137339,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_64_opcodes",
            "value": 41698,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_64_gates",
            "value": 172496,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_first_empty_tx_opcodes",
            "value": 1082,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_first_empty_tx_gates",
            "value": 737888,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_64_64_opcodes",
            "value": 43534,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_64_64_gates",
            "value": 153314,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_64_opcodes",
            "value": 44762,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_64_gates",
            "value": 189579,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_4_opcodes",
            "value": 34834,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_4_gates",
            "value": 124529,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_64_opcodes",
            "value": 41254,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_64_gates",
            "value": 146504,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_tail_opcodes",
            "value": 9096,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_tail_gates",
            "value": 45561,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_64_0_0_0_0_0_opcodes",
            "value": 37690,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_64_0_0_0_0_0_gates",
            "value": 290200,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_0_64_0_0_0_0_opcodes",
            "value": 19335,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_0_64_0_0_0_0_gates",
            "value": 107204,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/parity_root_opcodes",
            "value": 3013,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/parity_root_gates",
            "value": 3121577,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_inner_opcodes",
            "value": 19697,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_inner_gates",
            "value": 103011,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_4_64_opcodes",
            "value": 44578,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_4_64_gates",
            "value": 188471,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_4_4_opcodes",
            "value": 38758,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_4_4_gates",
            "value": 175661,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_checkpoint_merge_opcodes",
            "value": 1716,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_checkpoint_merge_gates",
            "value": 1583352,
            "unit": "gates"
          }
        ]
      }
    ]
  }
}