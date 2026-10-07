// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {Bn254LibWrapper} from "@aztec/governance/Bn254LibWrapper.sol";
import {BN254Fixtures} from "@test/shared/BN254Fixtures.t.sol";

// solhint-disable comprehensive-interface

/**
 * @notice Shared helpers for measuring the gas cost of BN254 proof-of-possession (PoP) verification
 *         through `Bn254LibWrapper`, the contract that GSE calls with `{gas: proofOfPossessionGasLimit}`.
 */
contract PopGasBase is BN254Fixtures {
  /// @notice How `BN254Lib.hashToPoint` behaves for a given pk1.
  struct DigestStats {
    // Loop attempts (keccak evaluations inside the loop), including the successful one.
    uint256 attempts;
    // Attempts with x < p, i.e. attempts that called the modexp-based sqrt.
    uint256 sqrtCalls;
    // Attempts rejected because x >= p.
    uint256 fieldRejections;
    // Whether the sqrt result was the larger root, so `hashToPoint` swapped (y0, y1).
    bool swapped;
    // Low bit of keccak(domain, message, type(uint256).max): 0 picks the smaller root, 1 the larger.
    uint256 rootBit;
    G1Point digest;
  }

  struct Measurement {
    // Gas consumed by the wrapper frame when called with ample gas.
    uint256 gasUsed;
    // Smallest `{gas: g}` stipend for which the call succeeds (and returns true when `expectValid`).
    uint256 minStipend;
  }

  Bn254LibWrapper internal wrapper;

  function setUp() public virtual override(BN254Fixtures) {
    super.setUp();
    wrapper = new Bn254LibWrapper();
  }

  /**
   * @notice Mirrors the loop in `BN254Lib.hashToPoint` with counters. The resulting digest is checked against the
   *         library itself so the counters always describe the code that is measured.
   */
  function digestStats(G1Point memory _pk1) internal view returns (DigestStats memory stats) {
    bytes memory message = abi.encodePacked(_pk1.x, _pk1.y);
    bytes32 domain = BN254Lib.STAKING_DOMAIN_SEPARATOR;
    uint256 p = BN254Lib.BASE_FIELD_ORDER;
    while (true) {
      uint256 x = uint256(keccak256(abi.encode(domain, message, stats.attempts)));
      stats.attempts++;
      if (x >= p) {
        stats.fieldRejections++;
        continue;
      }
      stats.sqrtCalls++;
      uint256 y = addmod(mulmod(mulmod(x, x, p), x, p), 3, p);
      (uint256 root, bool found) = BN254Lib.sqrt(y);
      if (found) {
        uint256 y0 = root;
        uint256 y1 = p - root;
        if (y0 > y1) {
          (y0, y1) = (y1, y0);
          stats.swapped = true;
        }
        stats.rootBit = uint256(keccak256(abi.encode(domain, message, type(uint256).max))) & 1;
        stats.digest = G1Point({x: x, y: stats.rootBit == 0 ? y0 : y1});
        break;
      }
    }
    G1Point memory libDigest = BN254Lib.g1ToDigestPoint(_pk1);
    require(libDigest.x == stats.digest.x && libDigest.y == stats.digest.y, "digest mirror mismatch");
  }

  function pk1Of(uint256 _sk) internal view returns (G1Point memory) {
    return BN254Lib.g1Mul(BN254Lib.g1Generator(), _sk);
  }

  function signatureOf(G1Point memory _digest, uint256 _sk) internal view returns (G1Point memory) {
    return BN254Lib.g1Mul(_digest, _sk);
  }

  /**
   * @notice Measures the wrapper frame: gas used with an ample stipend, and the minimum stipend for which the call
   *         succeeds. The two differ because the precompile calls forward `sub(gas(), 2000)`, capped at 63/64 of
   *         the remaining gas, so the frame needs headroom at the pairing call beyond what it finally consumes.
   * @param _expectValid When true, success also requires the wrapper to return true.
   */
  function measure(G1Point memory _pk1, G2Point memory _pk2, G1Point memory _sig, bool _expectValid)
    internal
    view
    returns (Measurement memory m)
  {
    bytes memory data = abi.encodeCall(Bn254LibWrapper.proofOfPossession, (_pk1, _pk2, _sig));
    (bool ok, bytes memory ret) = address(wrapper).staticcall{gas: 5_000_000}(data);
    require(ok, "pop call reverted with ample gas");
    require(!_expectValid || abi.decode(ret, (bool)), "pop returned false for an expected-valid tuple");
    m.gasUsed = vm.lastCallGas().gasTotalUsed;

    uint256 lo = m.gasUsed - 1; // fails: the frame needs at least what it consumes
    uint256 hi = m.gasUsed + 20_000;
    require(_succeeds(data, hi, _expectValid), "pop fails with gasUsed + 20k stipend");
    require(!_succeeds(data, lo, _expectValid), "pop succeeds below its own gas usage");
    while (hi - lo > 1) {
      uint256 mid = (lo + hi) / 2;
      if (_succeeds(data, mid, _expectValid)) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    m.minStipend = hi;
  }

  /// @notice Gas used by the wrapper's `g1ToDigestPoint`, i.e. `hashToPoint` on a 64-byte pk1 plus call overhead.
  function measureDigest(G1Point memory _pk1) internal view returns (uint256) {
    (bool ok,) = address(wrapper).staticcall{gas: 5_000_000}(abi.encodeCall(Bn254LibWrapper.g1ToDigestPoint, (_pk1)));
    require(ok, "digest call reverted");
    return vm.lastCallGas().gasTotalUsed;
  }

  function _succeeds(bytes memory _data, uint256 _gas, bool _expectValid) private view returns (bool) {
    (bool ok, bytes memory ret) = address(wrapper).staticcall{gas: _gas}(_data);
    if (!ok || ret.length != 32) {
      return false;
    }
    return !_expectValid || abi.decode(ret, (bool));
  }
}
