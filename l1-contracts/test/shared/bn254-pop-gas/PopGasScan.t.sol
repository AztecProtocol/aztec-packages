// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {BN254Lib, G1Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {PopGasBase} from "./PopGasBase.sol";
import {console} from "forge-std/console.sol";

// solhint-disable comprehensive-interface

/**
 * @notice Offline search over small test scalars sk = 1..POP_GAS_SCAN_MAX for keys whose `hashToPoint` needs many
 *         loop attempts or many sqrt calls, plus the empirical attempt and sqrt-call distributions. Skipped unless
 *         POP_GAS_SCAN_MAX is set; see README.md in this directory.
 */
contract PopGasScanTest is PopGasBase {
  uint256 internal constant HIST_SIZE = 256;

  function test_scanSmallScalars() external {
    uint256 scanMax = vm.envOr("POP_GAS_SCAN_MAX", uint256(0));
    if (scanMax == 0) {
      vm.skip(true);
    }
    uint256 attemptsThreshold = vm.envOr("POP_GAS_SCAN_MIN_ATTEMPTS", uint256(80));
    uint256 sqrtThreshold = vm.envOr("POP_GAS_SCAN_MIN_SQRT", uint256(15));

    uint256[] memory attemptsHist = new uint256[](HIST_SIZE);
    uint256[] memory sqrtHist = new uint256[](HIST_SIZE);

    uint256 x = 1;
    uint256 y = 2;
    for (uint256 sk = 1; sk <= scanMax; sk++) {
      uint256 freeMemoryPointer;
      assembly {
        freeMemoryPointer := mload(0x40)
      }
      if (sk > 1) {
        G1Point memory next = BN254Lib.g1Add(G1Point({x: x, y: y}), BN254Lib.g1Generator());
        (x, y) = (next.x, next.y);
      }
      (uint256 attempts, uint256 sqrtCalls) = _count(G1Point({x: x, y: y}));
      attemptsHist[attempts < HIST_SIZE ? attempts : HIST_SIZE - 1]++;
      sqrtHist[sqrtCalls < HIST_SIZE ? sqrtCalls : HIST_SIZE - 1]++;
      if (attempts >= attemptsThreshold || sqrtCalls >= sqrtThreshold) {
        console.log(
          string.concat("POPSCAN_TAIL ", vm.toString(sk), " ", vm.toString(attempts), " ", vm.toString(sqrtCalls))
        );
      }
      // The scan touches millions of loop attempts; release the per-key allocations so memory stays flat.
      assembly {
        mstore(0x40, freeMemoryPointer)
      }
    }

    string memory a = "POPSCAN_ATTEMPTS_HIST";
    string memory s = "POPSCAN_SQRT_HIST";
    for (uint256 i = 0; i < HIST_SIZE; i++) {
      a = string.concat(a, " ", vm.toString(attemptsHist[i]));
      s = string.concat(s, " ", vm.toString(sqrtHist[i]));
    }
    console.log(string.concat("POPSCAN_RANGE 1 ", vm.toString(scanMax)));
    console.log(a);
    console.log(s);
  }

  function _count(G1Point memory _pk1) internal view returns (uint256 attempts, uint256 sqrtCalls) {
    bytes memory message = abi.encodePacked(_pk1.x, _pk1.y);
    bytes32 domain = BN254Lib.STAKING_DOMAIN_SEPARATOR;
    uint256 p = BN254Lib.BASE_FIELD_ORDER;
    while (true) {
      uint256 x = uint256(keccak256(abi.encode(domain, message, attempts)));
      attempts++;
      if (x >= p) {
        continue;
      }
      sqrtCalls++;
      (, bool found) = BN254Lib.sqrt(addmod(mulmod(mulmod(x, x, p), x, p), 3, p));
      if (found) {
        return (attempts, sqrtCalls);
      }
    }
  }
}
