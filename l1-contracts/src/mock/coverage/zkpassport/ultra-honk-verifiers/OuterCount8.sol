// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";

contract HonkVerifier is IVerifier {
  function verify(bytes calldata, bytes32[] calldata) external pure override(IVerifier) returns (bool) {
    return true;
  }
}
