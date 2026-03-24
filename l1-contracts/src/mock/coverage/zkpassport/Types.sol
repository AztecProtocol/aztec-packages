// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

struct ProofVerificationData {
  bytes32 vkeyHash;
  bytes proof;
  bytes32[] publicInputs;
}

struct ServiceConfig {
  uint256 validityPeriodInSeconds;
  string domain;
  string scope;
  bool devMode;
}

struct ProofVerificationParams {
  bytes32 version;
  ProofVerificationData proofVerificationData;
  bytes committedInputs;
  ServiceConfig serviceConfig;
}

struct ProofVerifier {
  bytes32 vkeyHash;
  address verifier;
}

struct BoundData {
  address senderAddress;
  uint256 chainId;
  string customData;
}
