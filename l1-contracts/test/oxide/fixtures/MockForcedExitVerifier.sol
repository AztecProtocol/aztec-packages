// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";

contract MockForcedExitVerifier is IVerifier {
  bytes32 public expectedProofHash;
  bytes32 public expectedPublicInputsHash;
  bool public shouldVerify = true;

  function setExpected(bytes calldata _proof, bytes32[] calldata _publicInputs) external {
    expectedProofHash = keccak256(_proof);
    expectedPublicInputsHash = keccak256(abi.encode(_publicInputs));
  }

  function setShouldVerify(bool _shouldVerify) external {
    shouldVerify = _shouldVerify;
  }

  function verify(bytes calldata _proof, bytes32[] calldata _publicInputs) external view returns (bool) {
    return shouldVerify && keccak256(_proof) == expectedProofHash
      && keccak256(abi.encode(_publicInputs)) == expectedPublicInputsHash;
  }
}
