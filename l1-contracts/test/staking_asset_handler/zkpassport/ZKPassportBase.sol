// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {ZKPassportVerifier, ProofVerificationParams} from "@zkpassport/ZKPassportVerifier.sol";
import {IRootRegistry} from "@zkpassport/IRootRegistry.sol";
import {HonkVerifier as OuterVerifier7} from "@zkpassport/ultra-honk-verifiers/OuterCount7.sol";
import {MockRootRegistry} from "./MockRootRegistry.sol";
import {MockZKPassportVerifier} from "@aztec/mock/staking_asset_handler/MockZKPassportVerifier.sol";
import {CommittedInputLen} from "@zkpassport/Constants.sol";

import {Test} from "forge-std/Test.sol";

contract ZKPassportBase is Test {
  ZKPassportVerifier public zkPassportVerifier;
  MockZKPassportVerifier public mockZKPassportVerifier;

  OuterVerifier7 public verifier;
  IRootRegistry public rootRegistry;

  ProofVerificationParams internal fakeProof;
  ProofVerificationParams internal realProof;

  // Path to the proof file - using files directly in project root
  // Fixtures copied from within the zk passport subrepo
  bytes32 constant VKEY_HASH = 0x2992c925ad8932475d5784bf202b58f1c9d043d6ec04e236a7c761593caea5ce;

  // From fixtures - see lib/circuits/src/solidity/test/SampleContract.t.sol
  string constant CORRECT_DOMAIN = "zkpassport.id";
  string constant CORRECT_SCOPE = "bigproof";

  // Time when the proof was generated - 2025-09-26T15:46:45.835Z
  uint256 public PROOF_GENERATION_TIMESTAMP = 1_758_901_597;

  // Using this base contract will make a zkpassport verifier and proof available for testing purposes
  constructor() {
    // Root registry for the zk passport verifier
    rootRegistry = new MockRootRegistry();

    // Deploy wrapper verifier
    zkPassportVerifier = new ZKPassportVerifier(address(rootRegistry));
    // Deploy actual circuit verifier
    verifier = new OuterVerifier7();

    // Add to the zk passport verifier
    bytes32[] memory vkeyHashes = new bytes32[](1);
    vkeyHashes[0] = VKEY_HASH;

    address[] memory verifiers = new address[](1);
    verifiers[0] = address(verifier);

    zkPassportVerifier.addVerifiers(vkeyHashes, verifiers);

    // Set the timestamp to PROOF_GENERATION_TIMESTAMP
    vm.warp(PROOF_GENERATION_TIMESTAMP);
    realProof = makeValidProof();
    fakeProof = makeFakeProof();

    // Mock verifier
    mockZKPassportVerifier = new MockZKPassportVerifier();
  }

  function makeValidProof() internal view returns (ProofVerificationParams memory params) {
    bytes memory proof = loadBytesFromFile("valid_proof.hex");
    bytes32[] memory publicInputs = loadBytes32FromFile("valid_public_inputs.json");
    bytes memory committedInputs = loadBytesFromFile("valid_committed_inputs.hex");

    // Order of bytes of committed inputs for each disclosure proof
    uint256[] memory committedInputCounts = new uint256[](4);
    committedInputCounts[0] = CommittedInputLen.BIND;
    committedInputCounts[1] = CommittedInputLen.SANCTIONS;
    committedInputCounts[2] = CommittedInputLen.EXCL_NATIONALITY;
    committedInputCounts[3] = CommittedInputLen.COMPARE_AGE;

    params = ProofVerificationParams({
      vkeyHash: VKEY_HASH,
      proof: proof,
      publicInputs: publicInputs,
      committedInputs: committedInputs,
      committedInputCounts: committedInputCounts,
      validityPeriodInSeconds: 7 days,
      domain: "zkpassport.id",
      scope: "bigproof",
      devMode: false
    });
  }

  function makeFakeProof() internal pure returns (ProofVerificationParams memory params) {
    bytes memory proof = bytes(string(""));
    bytes32[] memory publicInputs = new bytes32[](0);
    bytes memory committedInputs = bytes(string(""));

    // Order of bytes of committed inputs for each disclosure proof
    uint256[] memory committedInputCounts = new uint256[](8);
    committedInputCounts[0] = 181;
    committedInputCounts[1] = 601;
    committedInputCounts[2] = 601;
    committedInputCounts[3] = 601;
    committedInputCounts[4] = 601;
    committedInputCounts[5] = 11;
    committedInputCounts[6] = 25;
    committedInputCounts[7] = 25;

    params = ProofVerificationParams({
      vkeyHash: VKEY_HASH,
      proof: proof,
      publicInputs: publicInputs,
      committedInputs: committedInputs,
      committedInputCounts: committedInputCounts,
      validityPeriodInSeconds: 7 days,
      domain: "zkpassport.id",
      scope: "bigproof",
      devMode: true
    });
  }

  /**
   * @dev Helper function to load proof data from a file
   */
  function loadBytesFromFile(string memory name) internal view returns (bytes memory) {
    // Try to read the file as a string
    string memory path = getPath(name);
    string memory proofHex = vm.readFile(path);

    // Check if content starts with 0x
    if (bytes(proofHex).length > 2 && bytes(proofHex)[0] == "0" && bytes(proofHex)[1] == "x") {
      proofHex = slice(proofHex, 2, bytes(proofHex).length - 2);
    }

    // Try to parse the bytes
    return vm.parseBytes(proofHex);
  }

  function getPath(string memory name) internal view returns (string memory path) {
    string memory root = vm.projectRoot();
    path = string.concat(root, "/test/staking_asset_handler/zkpassport/fixtures/", name);
  }

  /**
   * @dev Helper function to load public inputs from a file
   */
  function loadBytes32FromFile(string memory name) internal view returns (bytes32[] memory) {
    string memory path = getPath(name);

    string memory inputsJson = vm.readFile(path);
    // Parse the inputs from the file
    string[] memory inputs = vm.parseJsonStringArray(inputsJson, ".inputs");
    bytes32[] memory result = new bytes32[](inputs.length);

    for (uint256 i = 0; i < inputs.length; i++) {
      result[i] = vm.parseBytes32(inputs[i]);
    }

    return result;
  }

  /**
   * @dev Helper function to slice a string
   */
  function slice(string memory s, uint256 start, uint256 length) internal pure returns (string memory) {
    bytes memory b = bytes(s);
    require(start + length <= b.length, "String slice out of bounds");

    bytes memory result = new bytes(length);
    for (uint256 i = 0; i < length; i++) {
      result[i] = b[start + i];
    }

    return string(result);
  }
}
