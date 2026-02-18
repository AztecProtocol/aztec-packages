// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {BaseHonkVerifier as BASE} from "./../BaseHonkVerifier.sol";
import {Honk} from "./../HonkTypes.sol";
import {
    RecursiveHonkVerificationKey as VK,
    N,
    LOG_N,
    NUMBER_OF_PUBLIC_INPUTS,
    VK_HASH
} from "./../keys/RecursiveHonkVerificationKey.sol";

/// Smart contract verifier of honk proofs
contract RecursiveHonkVerifier is BASE(N, LOG_N, VK_HASH, NUMBER_OF_PUBLIC_INPUTS) {
    function loadVerificationKey() internal pure override returns (Honk.VerificationKey memory) {
        return VK.loadVerificationKey();
    }
}
