// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {GSE} from "@aztec/governance/GSE.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";

contract GSEWithSkip is GSE {
  // the `gap` pushes the `checkProofOfPossession` into its own slot
  // so we don't have the trouble of being in the middle of a slot
  uint256 private gap = 0;

  // @note  Always true, exists to override to false for testing only.
  bool public checkProofOfPossession = true;

  constructor(address __owner, IERC20 _asset, uint256 _activationThreshold, uint256 _ejectionThreshold)
    GSE(__owner, _asset, _activationThreshold, _ejectionThreshold)
  {}

  function setCheckProofOfPossession(bool _shouldCheck) external {
    checkProofOfPossession = _shouldCheck;
  }

  function _checkProofOfPossession(
    address _attester,
    G1Point memory _publicKeyInG1,
    G2Point memory _publicKeyInG2,
    G1Point memory _proofOfPossession
  ) internal override {
    if (checkProofOfPossession) {
      super._checkProofOfPossession(_attester, _publicKeyInG1, _publicKeyInG2, _proofOfPossession);
    }
  }
}
