// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.21;

import {NegativeTestBase} from "./NegativeTestBase.sol";
import {IVerifier} from "src/interfaces/IVerifier.sol";
import {BlakeHonkVerifier} from "src/honk/instance/BlakeHonk.sol";
import {BaseHonkVerifier} from "src/honk/BaseHonkVerifier.sol";

/**
 * @title NegativeTestHonk
 * @notice Negative tests for the standard (non-ZK) Blake Honk verifier
 *
 * @dev Inherits all tests from NegativeTestBase and provides error selectors
 * for BaseHonkVerifier:
 * - BaseHonkVerifier.SumcheckFailed for sumcheck failures
 * - BaseHonkVerifier.ShpleminiFailed for pairing failures
 * - "point is not on the curve" for on-curve validation
 * - BaseHonkVerifier.ProofLengthWrongWithLogN for proof length
 * - BaseHonkVerifier.PublicInputsLengthWrong for public inputs length
 */
contract NegativeTestHonk is NegativeTestBase {
    /*//////////////////////////////////////////////////////////////
                        VIRTUAL FUNCTION OVERRIDES
    //////////////////////////////////////////////////////////////*/

    function _createVerifier() internal override returns (IVerifier) {
        return IVerifier(address(new BlakeHonkVerifier()));
    }
}
