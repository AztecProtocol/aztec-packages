// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.21;

import {NegativeTestBase} from "./NegativeTestBase.sol";
import {IVerifier} from "src/interfaces/IVerifier.sol";
import {BlakeOptHonkVerifier} from "src/honk/instance/BlakeHonkOpt.sol";

/**
 * @title NegativeTestBlakeOptHonk
 * @notice Negative tests for the OPTIMIZED Blake Honk verifier (non-ZK variant)
 *
 * @dev Inherits all tests from NegativeTestBase. The optimized verifier uses
 * the same error selectors as the standard verifier (from Errors.sol), and performs
 * inline input validation including proof/public input length checks.
 * No test overrides are needed.
 */
contract NegativeTestBlakeOptHonk is NegativeTestBase {
    /*//////////////////////////////////////////////////////////////
                        VIRTUAL FUNCTION OVERRIDES
    //////////////////////////////////////////////////////////////*/

    function _createVerifier() internal override returns (IVerifier) {
        return IVerifier(address(new BlakeOptHonkVerifier()));
    }
}
