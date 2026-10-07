// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {PopGasBase} from "./PopGasBase.sol";
import {BN254G2TestLib} from "./BN254G2TestLib.sol";
import {console} from "forge-std/console.sol";

// solhint-disable comprehensive-interface

/**
 * @notice Measures proof-of-possession verification gas for the calibration corpus and prints one line per vector.
 *         `scripts/bn254_pop_gas_model.py` runs this under several EVM versions, fits the cost model and writes
 *         `test/fixtures/bn254_pop_gas_vectors.json`. Skipped unless POP_GAS_GENERATE=true; see README.md here.
 *
 *         Every scalar below is a public test scalar (small integers found by `PopGasScanTest`, or the published
 *         sample keys in bn254_constants.json). Never use any of them for a real validator.
 */
contract PopGasGenerateTest is PopGasBase {
  // sk = 1..2_000_000 scan hits with >= 110 attempts or >= 17 sqrt calls, plus two 1..60_000 hits with >= 90 attempts.
  uint256[] internal tailScalars = [
    13_154,
    31_312,
    36_300,
    57_193,
    84_080,
    103_623,
    150_199,
    241_572,
    248_352,
    271_935,
    286_992,
    299_660,
    317_342,
    368_752,
    417_985,
    436_912,
    441_678,
    447_993,
    459_885,
    530_144,
    681_933,
    693_083,
    706_579,
    711_538,
    718_617,
    723_828,
    814_444,
    850_189,
    865_039,
    884_458,
    894_541,
    909_548,
    933_917,
    998_704,
    1_117_023,
    1_133_435,
    1_147_180,
    1_181_788,
    1_204_211,
    1_216_207,
    1_255_357,
    1_267_879,
    1_290_026,
    1_314_687,
    1_318_568,
    1_338_099,
    1_351_955,
    1_412_769,
    1_459_623,
    1_503_562,
    1_531_894,
    1_556_725,
    1_559_796,
    1_560_031,
    1_583_718,
    1_640_875,
    1_649_310,
    1_667_279,
    1_671_350,
    1_686_148,
    1_691_595,
    1_704_727,
    1_726_966,
    1_745_321,
    1_781_160,
    1_818_309,
    1_843_201,
    1_884_493,
    1_955_106,
    1_982_295
  ];

  uint256 internal constant SMALL_SCALARS = 32;

  function test_generateCalibrationData() external {
    if (!vm.envOr("POP_GAS_GENERATE", false)) {
      vm.skip(true);
    }
    _logPrecompiles();

    for (uint256 i = 0; i < fixtureData.sampleKeys.length; i++) {
      FixtureKey memory key = fixtureData.sampleKeys[i];
      G2Point memory pk2 = BN254G2TestLib.mulGenerator(key.sk);
      require(
        pk2.x0 == key.pk2.x0 && pk2.x1 == key.pk2.x1 && pk2.y0 == key.pk2.y0 && pk2.y1 == key.pk2.y1,
        "G2 test helper disagrees with bn254_constants.json"
      );
      _logVector(string.concat("sample-", vm.toString(i)), key.sk);
    }
    for (uint256 sk = 1; sk <= SMALL_SCALARS; sk++) {
      _logVector(string.concat("small-", vm.toString(sk)), sk);
    }
    for (uint256 i = 0; i < tailScalars.length; i++) {
      _logVector(string.concat("tail-", vm.toString(tailScalars[i])), tailScalars[i]);
    }

    // Bulk corpus for model validation. pk2 is the G2 generator, so the pairing returns false, but the gas is the
    // same as for a valid tuple: every precompile price here depends only on input sizes (asserted per vector in
    // `_logVector`).
    uint256 bulk = vm.envOr("POP_GAS_BULK", uint256(2000));
    G2Point memory g2 = BN254G2TestLib.generator();
    for (uint256 sk = SMALL_SCALARS + 1; sk <= SMALL_SCALARS + bulk; sk++) {
      G1Point memory pk1 = pk1Of(sk);
      DigestStats memory stats = digestStats(pk1);
      Measurement memory m = measure(pk1, g2, signatureOf(stats.digest, sk), false);
      console.log(
        string.concat(
          "POPGAS_BULK ",
          vm.toString(sk),
          " ",
          vm.toString(stats.attempts),
          " ",
          vm.toString(stats.sqrtCalls),
          " ",
          vm.toString(m.gasUsed),
          " ",
          vm.toString(m.minStipend),
          " ",
          vm.toString(measureDigest(pk1))
        )
      );
    }
  }

  function _logVector(string memory _label, uint256 _sk) internal view {
    G1Point memory pk1 = pk1Of(_sk);
    G2Point memory pk2 = BN254G2TestLib.mulGenerator(_sk);
    DigestStats memory stats = digestStats(pk1);
    G1Point memory sig = signatureOf(stats.digest, _sk);
    Measurement memory m = measure(pk1, pk2, sig, true);
    Measurement memory substitute = measure(pk1, BN254G2TestLib.generator(), sig, false);
    require(
      substitute.gasUsed == m.gasUsed && substitute.minStipend == m.minStipend,
      "invalid-pairing substitute costs differ from the valid tuple"
    );

    string memory line = string.concat(
      "POPGAS_VEC ",
      _label,
      " ",
      vm.toString(_sk),
      " ",
      vm.toString(stats.attempts),
      " ",
      vm.toString(stats.sqrtCalls),
      " ",
      vm.toString(stats.fieldRejections),
      " ",
      stats.swapped ? "1" : "0",
      " ",
      vm.toString(stats.rootBit)
    );
    line = string.concat(
      line, " ", vm.toString(m.gasUsed), " ", vm.toString(m.minStipend), " ", vm.toString(measureDigest(pk1))
    );
    line = string.concat(line, " ", vm.toString(pk1.x), " ", vm.toString(pk1.y));
    line = string.concat(
      line, " ", vm.toString(pk2.x0), " ", vm.toString(pk2.x1), " ", vm.toString(pk2.y0), " ", vm.toString(pk2.y1)
    );
    line = string.concat(line, " ", vm.toString(sig.x), " ", vm.toString(sig.y));
    line = string.concat(line, " ", vm.toString(stats.digest.x), " ", vm.toString(stats.digest.y));
    console.log(line);
  }

  function _logPrecompiles() internal view {
    uint256 p = BN254Lib.BASE_FIELD_ORDER;
    bytes memory modexpInput = abi.encode(
      uint256(32),
      uint256(32),
      uint256(32),
      uint256(5),
      0xc19139cb84c680a6e14116da060561765e05aa45a1c72a34f082305b61f3f52,
      p
    );
    G2Point memory g2 = BN254G2TestLib.generator();
    G2Point memory ng2 = BN254Lib.g2NegatedGenerator();
    bytes memory pairingInput = abi.encode(
      uint256(1), uint256(2), g2.x1, g2.x0, g2.y1, g2.y0, uint256(1), uint256(2), ng2.x1, ng2.x0, ng2.y1, ng2.y0
    );
    console.log(
      string.concat(
        "POPGAS_PRECOMPILES ",
        vm.toString(_precompileGas(address(0x05), modexpInput)),
        " ",
        vm.toString(_precompileGas(address(0x06), abi.encode(uint256(1), uint256(2), uint256(1), uint256(2)))),
        " ",
        vm.toString(_precompileGas(address(0x07), abi.encode(uint256(1), uint256(2), uint256(3)))),
        " ",
        vm.toString(_precompileGas(address(0x08), pairingInput))
      )
    );
  }

  function _precompileGas(address _precompile, bytes memory _input) internal view returns (uint256) {
    (bool ok,) = _precompile.staticcall{gas: 1_000_000}(_input);
    require(ok, "precompile call failed");
    return vm.lastCallGas().gasTotalUsed;
  }
}
