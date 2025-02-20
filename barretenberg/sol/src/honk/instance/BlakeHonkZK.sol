// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs
pragma solidity >=0.8.21;

import {IVerifier} from "../../interfaces/IVerifier.sol";
import {BlakeHonkVerificationKey as VK, N, LOG_N, NUMBER_OF_PUBLIC_INPUTS} from "../keys/BlakeHonkVerificationKey.sol";

import {Honk} from "../HonkTypes.sol";

import {BaseZKHonkVerifier as BASE} from "../BaseZKHonkVerifier.sol";

/// Smart contract verifier of honk proofs
contract BlakeHonkZKVerifier is BASE(N, LOG_N, NUMBER_OF_PUBLIC_INPUTS) {
    function loadVerificationKey() internal pure override returns (Honk.VerificationKey memory) {
        return VK.loadVerificationKey();
    }
}
