// SPDX-License-Identifier: Apache-2.0
// Coverage-only mock with intentionally minimal interface behavior.
// solhint-disable imports-order
// solhint-disable immutable-vars-naming
// solhint-disable comprehensive-interface
// solhint-disable no-empty-blocks
// solhint-disable ordering
// solhint-disable reason-string
// solhint-disable gas-custom-errors
pragma solidity >=0.8.27;

import {ProofVerificationParams} from "./Types.sol";
import {ZKPassportHelper} from "./ZKPassportHelper.sol";
import {IRootRegistry} from "./IRootRegistry.sol";
import {ZKPassportSubVerifier} from "./ZKPassportSubVerifier.sol";

contract ZKPassportRootVerifier {
  uint256 internal constant PROOF_GENERATION_TIMESTAMP = 1_762_167_715;

  address public immutable owner;
  address public immutable updater;
  IRootRegistry public immutable rootRegistry;

  mapping(bytes32 version => address helper) internal helpers;

  constructor(address _owner, address _updater, IRootRegistry _rootRegistry) {
    owner = _owner;
    updater = _updater;
    rootRegistry = _rootRegistry;
  }

  function addSubVerifier(bytes32, ZKPassportSubVerifier) external pure {}

  function addHelper(bytes32 _version, address _helper) external {
    helpers[_version] = _helper;
  }

  function verify(ProofVerificationParams calldata _params) external view returns (bool, bytes32, ZKPassportHelper) {
    uint256 proofExpiry = PROOF_GENERATION_TIMESTAMP + _params.serviceConfig.validityPeriodInSeconds;
    require(block.timestamp <= proofExpiry, "The proof was generated outside the validity period");

    uint256 publicInputsLength = _params.proofVerificationData.publicInputs.length;
    bytes32 nullifier =
      publicInputsLength == 0 ? bytes32(0) : _params.proofVerificationData.publicInputs[publicInputsLength - 1];
    address helper = helpers[_params.version];
    return (true, nullifier, ZKPassportHelper(helper));
  }
}
