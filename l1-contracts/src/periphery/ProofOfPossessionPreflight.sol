// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {IGSE} from "@aztec/governance/GSE.sol";
import {IBn254LibWrapper} from "@aztec/governance/interfaces/IBn254LibWrapper.sol";
import {G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {
  IProofOfPossessionGasLimit,
  IProofOfPossessionPreflight,
  PopPreflightResult,
  PopPreflightStatus
} from "./interfaces/IProofOfPossessionPreflight.sol";

/**
 * @title ProofOfPossessionPreflight
 * @author Aztec Labs
 * @notice Read-only check that a validator registration tuple's BLS proof of possession verifies within the GSE's
 *         `proofOfPossessionGasLimit`.
 *
 *         `GSE.deposit` verifies the proof in a call to its BN254 wrapper capped at that limit. The cost of that
 *         verification depends on the key, since `BN254Lib.hashToPoint` is a rejection-sampling loop, so a small
 *         fraction of honestly generated keys need more gas than the cap and are rejected even though their proof
 *         is valid. Registration tooling can run this check with `eth_call` before depositing and generate a new key
 *         when the result is `OverBudget`.
 *
 * @dev The contract is stateless, has no constructor arguments and never uses its own address, so it can run without
 *      being deployed: as a deployless `eth_call` with its creation code, or with its runtime code placed anywhere
 *      by a state override.
 *
 *      The capped call is the same call `GSE._checkProofOfPossession` makes: same wrapper, same arguments, same gas
 *      limit. A second call with ample gas tells a proof that is invalid apart from one that only needs more gas.
 *      Both calls only get their full gas if the outer call carries enough, which is checked first; otherwise the
 *      result is `InsufficientOuterGas`.
 */
contract ProofOfPossessionPreflight is IProofOfPossessionPreflight {
  /**
   * Gas kept for this contract's own work around the two verification calls: encoding the arguments, memory, and
   * building the result.
   */
  uint256 internal constant OVERHEAD_GAS = 30_000;

  /**
   * Minimum gas for the ample-gas call (it gets twice the cap if that is more). `hashToPoint` is unbounded, but a
   * valid key needing 2M gas would need more than 250 modexp square roots, which happens with probability below
   * 2^-250.
   */
  uint256 internal constant MIN_AMPLE_GAS = 2_000_000;

  /**
   * @inheritdoc IProofOfPossessionPreflight
   */
  function checkProofOfPossession(
    IGSE _gse,
    G1Point memory _publicKeyInG1,
    G2Point memory _publicKeyInG2,
    G1Point memory _proofOfPossession
  ) external view override(IProofOfPossessionPreflight) returns (PopPreflightResult memory result) {
    result.wrapper = bn254LibWrapperOf(address(_gse));

    // Below this, reading the cap could run out of gas and be reported as `_gse` not being a GSE.
    if (gasleft() < OVERHEAD_GAS) {
      result.status = PopPreflightStatus.InsufficientOuterGas;
      return result;
    }

    result.cap = _readCap(_gse);

    if (result.wrapper.code.length == 0) {
      result.status = PopPreflightStatus.NoWrapper;
      return result;
    }

    uint256 ampleGas = MIN_AMPLE_GAS;
    if (2 * uint256(result.cap) > ampleGas) {
      ampleGas = 2 * uint256(result.cap);
    }

    // Each call must be able to forward its full gas limit through the 63/64 rule.
    if (gasleft() < _gasToForward(result.cap) + _gasToForward(ampleGas) + OVERHEAD_GAS) {
      result.status = PopPreflightStatus.InsufficientOuterGas;
      return result;
    }

    // Same call as GSE._checkProofOfPossession.
    bool verifiedUnderCap;
    try IBn254LibWrapper(result.wrapper)
    .proofOfPossession{gas: result.cap}(_publicKeyInG1, _publicKeyInG2, _proofOfPossession) returns (bool verified) {
      verifiedUnderCap = verified;
    } catch {
      verifiedUnderCap = false;
    }

    bool verifiedWithAmpleGas;
    (verifiedWithAmpleGas, result.gasUsed) = _measuredVerification(
      result.wrapper,
      abi.encodeCall(IBn254LibWrapper.proofOfPossession, (_publicKeyInG1, _publicKeyInG2, _proofOfPossession)),
      ampleGas
    );

    if (verifiedUnderCap) {
      result.status = PopPreflightStatus.Valid;
    } else if (verifiedWithAmpleGas) {
      result.status = PopPreflightStatus.OverBudget;
    } else {
      result.status = PopPreflightStatus.Invalid;
    }
  }

  /**
   * @inheritdoc IProofOfPossessionPreflight
   */
  function bn254LibWrapperOf(address _gse) public pure override(IProofOfPossessionPreflight) returns (address) {
    // RLP([_gse, 1]) = 0xd6 0x94 <_gse> 0x01
    return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xd6), bytes1(0x94), _gse, bytes1(0x01))))));
  }

  /**
   * @notice Reads `proofOfPossessionGasLimit` from `_gse`, which `IGSE` does not expose.
   */
  function _readCap(IGSE _gse) internal view returns (uint64) {
    (bool success, bytes memory data) =
      address(_gse).staticcall(abi.encodeCall(IProofOfPossessionGasLimit.proofOfPossessionGasLimit, ()));
    require(success && data.length == 32, ProofOfPossessionPreflight__NotAGse(address(_gse)));
    uint256 cap = abi.decode(data, (uint256));
    require(cap <= type(uint64).max, ProofOfPossessionPreflight__NotAGse(address(_gse)));
    return uint64(cap);
  }

  /**
   * @notice Runs the verification with `_gas` and measures the gas it used, including the warm call's own cost.
   */
  function _measuredVerification(address _wrapper, bytes memory _calldata, uint256 _gas)
    internal
    view
    returns (bool verified, uint256 gasUsed)
  {
    assembly ("memory-safe") {
      let gasBefore := gas()
      let success := staticcall(_gas, _wrapper, add(_calldata, 0x20), mload(_calldata), 0x00, 0x20)
      gasUsed := sub(gasBefore, gas())
      verified := and(success, and(eq(returndatasize(), 0x20), eq(mload(0x00), 1)))
    }
  }

  /**
   * @notice The gas a caller must hold for a call to forward `_gas` despite the 63/64 rule.
   */
  function _gasToForward(uint256 _gas) internal pure returns (uint256) {
    return _gas + _gas / 63 + 1;
  }
}
