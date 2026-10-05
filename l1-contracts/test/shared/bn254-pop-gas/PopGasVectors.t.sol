// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {Bn254LibWrapper} from "@aztec/governance/Bn254LibWrapper.sol";
import {PopGasBase} from "./PopGasBase.sol";

// solhint-disable comprehensive-interface

/**
 * @notice Checks the calibration vectors in test/fixtures/bn254_pop_gas_vectors.json against the deployed code:
 *         every tuple is a valid proof of possession, the recorded hashToPoint attempt counts and digest match the
 *         library, and the recorded gas matches what the active EVM version charges. A mismatch in gas means the
 *         gas schedule (or the compiled verifier) changed and the cost model must be regenerated; see README.md.
 */
contract PopGasVectorsTest is PopGasBase {
  string internal constant FIXTURE = "/test/fixtures/bn254_pop_gas_vectors.json";

  struct Vectors {
    string[] label;
    uint256[] sk;
    uint256[] attempts;
    uint256[] sqrtCalls;
    uint256[] fieldRejections;
    bool[] swapped;
    uint256[] rootBit;
    G1Point[] pk1;
    G2Point[] pk2;
    G1Point[] signature;
    G1Point[] digest;
  }

  /// @notice Conservative cost model: F + A * attempts + S * sqrtCalls + ceil(Q * attempts^2), Q = qNum / qDen.
  struct Model {
    uint256 f;
    uint256 a;
    uint256 s;
    uint256 qNum;
    uint256 qDen;
  }

  function test_vectorsAreValidAndMatchHashToPoint() external view {
    (, Vectors memory v) = _load();
    assertGt(v.label.length, 0, "no vectors");
    for (uint256 i = 0; i < v.label.length; i++) {
      string memory label = v.label[i];
      DigestStats memory stats = digestStats(v.pk1[i]);
      assertEq(stats.attempts, v.attempts[i], string.concat(label, ": attempts"));
      assertEq(stats.sqrtCalls, v.sqrtCalls[i], string.concat(label, ": sqrtCalls"));
      assertEq(stats.fieldRejections, v.fieldRejections[i], string.concat(label, ": fieldRejections"));
      assertEq(stats.attempts, stats.sqrtCalls + stats.fieldRejections, string.concat(label, ": attempt split"));
      assertEq(stats.swapped, v.swapped[i], string.concat(label, ": swapped"));
      assertEq(stats.rootBit, v.rootBit[i], string.concat(label, ": rootBit"));
      assertEq(stats.digest.x, v.digest[i].x, string.concat(label, ": digest.x"));
      assertEq(stats.digest.y, v.digest[i].y, string.concat(label, ": digest.y"));

      G1Point memory pk1 = pk1Of(v.sk[i]);
      assertEq(pk1.x, v.pk1[i].x, string.concat(label, ": pk1.x"));
      assertEq(pk1.y, v.pk1[i].y, string.concat(label, ": pk1.y"));
      G1Point memory sig = signatureOf(v.digest[i], v.sk[i]);
      assertEq(sig.x, v.signature[i].x, string.concat(label, ": signature.x"));
      assertEq(sig.y, v.signature[i].y, string.concat(label, ": signature.y"));

      assertTrue(wrapper.proofOfPossession(v.pk1[i], v.pk2[i], v.signature[i]), string.concat(label, ": invalid PoP"));
    }
  }

  /// @notice The vectors cover both root choices, both orderings of the sqrt result, and field rejections.
  function test_vectorsCoverHashToPointBranches() external view {
    (, Vectors memory v) = _load();
    bool[4] memory rootCases;
    bool sawNoRejection;
    bool sawRejection;
    for (uint256 i = 0; i < v.label.length; i++) {
      rootCases[(v.swapped[i] ? 2 : 0) + v.rootBit[i]] = true;
      if (v.fieldRejections[i] == 0) {
        sawNoRejection = true;
      } else {
        sawRejection = true;
      }
    }
    for (uint256 i = 0; i < 4; i++) {
      assertTrue(rootCases[i], "missing (swapped, rootBit) combination");
    }
    assertTrue(sawNoRejection && sawRejection, "missing field rejection coverage");
  }

  /**
   * @notice Gas of each vector equals the fixture's column for the active EVM version (identified from the first
   *         vector), and the conservative model of that column upper-bounds the minimum stipend.
   */
  function test_gasMatchesFixtureForActiveEvm() external view {
    (string memory json, Vectors memory v) = _load();
    string memory evm = _detectEvm(json, v);
    Model memory model = _model(json, evm);
    uint256[] memory expectedGas = _column(json, string.concat("gas.", evm, ".verification"));
    uint256[] memory expectedStipend = _column(json, string.concat("gas.", evm, ".minStipend"));

    for (uint256 i = 0; i < v.label.length; i++) {
      string memory label = v.label[i];
      bytes memory data = abi.encodeCall(Bn254LibWrapper.proofOfPossession, (v.pk1[i], v.pk2[i], v.signature[i]));
      assertEq(_gasUsed(data), expectedGas[i], string.concat(label, ": verification gas"));
      assertTrue(_validWith(data, expectedStipend[i]), string.concat(label, ": fails at recorded min stipend"));
      assertFalse(_validWith(data, expectedStipend[i] - 1), string.concat(label, ": passes below min stipend"));

      assertLe(expectedStipend[i], _bound(model, v.attempts[i], v.sqrtCalls[i]), string.concat(label, ": model"));
    }
  }

  /**
   * @notice Each published max-iterations bound N is the largest attempt count whose worst case (every attempt calls
   *         sqrt) stays within the cap minus the margin, and every vector within N fits that budget when measured.
   */
  function test_maxIterationsFitCapWithMargin() external view {
    (string memory json, Vectors memory v) = _load();
    string memory evm = _detectEvm(json, v);
    Model memory model = _model(json, evm);
    uint256[] memory stipend = _column(json, string.concat("gas.", evm, ".minStipend"));
    uint256 bounds = abi.decode(vm.parseJson(json, ".maxIterations[*].cap"), (uint256[])).length;
    for (uint256 j = 0; j < bounds; j++) {
      string memory p = string.concat(".maxIterations[", vm.toString(j), "]");
      uint256 cap = vm.parseJsonUint(json, string.concat(p, ".cap"));
      uint256 budget = cap * (100 - vm.parseJsonUint(json, string.concat(p, ".marginPercent"))) / 100;
      uint256 n = vm.parseJsonUint(json, string.concat(p, ".", evm));
      assertLe(_bound(model, n, n), budget, "worst case at N exceeds the budget");
      assertGt(_bound(model, n + 1, n + 1), budget, "N is not the largest bound");
      for (uint256 i = 0; i < v.label.length; i++) {
        if (v.attempts[i] <= n) {
          assertLe(stipend[i], budget, string.concat(v.label[i], ": within N but over budget"));
        }
      }
    }
  }

  function _model(string memory _json, string memory _evm) internal pure returns (Model memory m) {
    string memory p = string.concat(".model.", _evm, ".minStipend");
    m.f = vm.parseJsonUint(_json, string.concat(p, ".F"));
    m.a = vm.parseJsonUint(_json, string.concat(p, ".A"));
    m.s = vm.parseJsonUint(_json, string.concat(p, ".S"));
    m.qNum = vm.parseJsonUint(_json, string.concat(p, ".QNumerator"));
    m.qDen = vm.parseJsonUint(_json, string.concat(p, ".QDenominator"));
  }

  function _bound(Model memory _m, uint256 _attempts, uint256 _sqrtCalls) internal pure returns (uint256) {
    return _m.f + _m.a * _attempts + _m.s * _sqrtCalls + (_m.qNum * _attempts * _attempts + _m.qDen - 1) / _m.qDen;
  }

  function _detectEvm(string memory _json, Vectors memory _v) internal view returns (string memory) {
    uint256 used = _gasUsed(abi.encodeCall(Bn254LibWrapper.proofOfPossession, (_v.pk1[0], _v.pk2[0], _v.signature[0])));
    string[] memory evms = vm.parseJsonStringArray(_json, ".evmVersions");
    for (uint256 i = 0; i < evms.length; i++) {
      if (vm.parseJsonUint(_json, string.concat(".vectors[0].gas.", evms[i], ".verification")) == used) {
        return evms[i];
      }
    }
    revert(
      string.concat(
        "verification gas ",
        vm.toString(used),
        " matches no EVM version in the fixture: regenerate it with scripts/bn254_pop_gas_model.py"
      )
    );
  }

  function _gasUsed(bytes memory _data) internal view returns (uint256) {
    (bool ok,) = address(wrapper).staticcall{gas: 5_000_000}(_data);
    require(ok, "pop call reverted");
    return vm.lastCallGas().gasTotalUsed;
  }

  function _validWith(bytes memory _data, uint256 _gas) internal view returns (bool) {
    (bool ok, bytes memory ret) = address(wrapper).staticcall{gas: _gas}(_data);
    return ok && ret.length == 32 && abi.decode(ret, (bool));
  }

  /// @dev Parses each field as one column so the (large) fixture is passed to the JSON cheatcodes a few times only.
  function _load() internal view returns (string memory json, Vectors memory v) {
    json = vm.readFile(string.concat(vm.projectRoot(), FIXTURE));
    v.label = abi.decode(vm.parseJson(json, ".vectors[*].label"), (string[]));
    v.sk = _column(json, "sk");
    v.attempts = _column(json, "attempts");
    v.sqrtCalls = _column(json, "sqrtCalls");
    v.fieldRejections = _column(json, "fieldRejections");
    v.swapped = abi.decode(vm.parseJson(json, ".vectors[*].swapped"), (bool[]));
    v.rootBit = _column(json, "rootBit");
    v.pk1 = _g1Column(json, "pk1");
    v.signature = _g1Column(json, "signature");
    v.digest = _g1Column(json, "digest");
    uint256[] memory x0 = _column(json, "pk2.x0");
    uint256[] memory x1 = _column(json, "pk2.x1");
    uint256[] memory y0 = _column(json, "pk2.y0");
    uint256[] memory y1 = _column(json, "pk2.y1");
    v.pk2 = new G2Point[](x0.length);
    for (uint256 i = 0; i < x0.length; i++) {
      v.pk2[i] = G2Point({x0: x0[i], x1: x1[i], y0: y0[i], y1: y1[i]});
    }
  }

  function _column(string memory _json, string memory _field) internal pure returns (uint256[] memory) {
    // `[*]` paths match many values, which the typed `parseJson*Array` cheatcodes reject; hex field elements are
    // fixed 32-byte strings, so they decode as uint256 too.
    return abi.decode(vm.parseJson(_json, string.concat(".vectors[*].", _field)), (uint256[]));
  }

  function _g1Column(string memory _json, string memory _field) internal pure returns (G1Point[] memory points) {
    uint256[] memory xs = _column(_json, string.concat(_field, ".x"));
    uint256[] memory ys = _column(_json, string.concat(_field, ".y"));
    points = new G1Point[](xs.length);
    for (uint256 i = 0; i < xs.length; i++) {
      points[i] = G1Point({x: xs[i], y: ys[i]});
    }
  }
}
