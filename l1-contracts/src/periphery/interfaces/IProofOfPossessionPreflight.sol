// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {IGSE} from "@aztec/governance/GSE.sol";
import {G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";

/**
 * @notice Outcome of a proof of possession preflight.
 * @dev Valid: the proof verifies within the GSE's gas cap, so `GSE.deposit` would accept it.
 *      Invalid: the proof does not verify, even with ample gas.
 *      OverBudget: the proof is valid but needs more gas than the cap, so `GSE.deposit` would reject it.
 *      InsufficientOuterGas: the call did not carry enough gas to run the checks; says nothing about the key.
 *      NoWrapper: there is no code at the address where the GSE's BN254 wrapper should be.
 */
enum PopPreflightStatus {
  Valid,
  Invalid,
  OverBudget,
  InsufficientOuterGas,
  NoWrapper
}

/**
 * @param status - The outcome, see `PopPreflightStatus`
 * @param cap - The GSE's live `proofOfPossessionGasLimit` (0 if the check stopped before reading it)
 * @param wrapper - The GSE's BN254 wrapper, which the GSE created at nonce 1
 * @param gasUsed - Gas used by the verification call when given ample gas (0 if it did not run). A cap must exceed
 *                  it by a little (about 1,600 gas) for the capped call to succeed, because BN254Lib holds 2,000 gas
 *                  back around each precompile call. `status`, not this margin, is authoritative.
 */
struct PopPreflightResult {
  PopPreflightStatus status;
  uint64 cap;
  address wrapper;
  uint256 gasUsed;
}

/**
 * @notice The GSE's public `proofOfPossessionGasLimit` getter, which `IGSE` does not declare.
 */
interface IProofOfPossessionGasLimit {
  function proofOfPossessionGasLimit() external view returns (uint64);
}

interface IProofOfPossessionPreflight {
  error ProofOfPossessionPreflight__NotAGse(address gse);

  /**
   * @notice Checks whether a registration tuple's proof of possession verifies within the GSE's gas cap.
   *
   * @dev Read-only and stateless. It can run through `eth_call` without being deployed, for example as a deployless
   *      call with the contract's creation code, or with its runtime code placed at any address by a state override.
   *
   *      The call needs enough gas to give the capped call the full cap and the ample-gas call at least 2M gas:
   *      about 2.33M at a 250k cap. With less it returns `InsufficientOuterGas`.
   *
   *      Reverts with `ProofOfPossessionPreflight__NotAGse` if `_gse` does not return a cap.
   *
   * @param _gse - The GSE the tuple will be deposited into
   * @param _publicKeyInG1 - pk1, as passed to `GSE.deposit`
   * @param _publicKeyInG2 - pk2, as passed to `GSE.deposit`
   * @param _proofOfPossession - The signature over the registration digest, as passed to `GSE.deposit`
   */
  function checkProofOfPossession(
    IGSE _gse,
    G1Point memory _publicKeyInG1,
    G2Point memory _publicKeyInG2,
    G1Point memory _proofOfPossession
  ) external view returns (PopPreflightResult memory);

  /**
   * @notice The address of the BN254 wrapper a GSE created in its constructor: the GSE's CREATE address at nonce 1.
   */
  function bn254LibWrapperOf(address _gse) external pure returns (address);
}
