// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity ^0.8.27;

library CoordinationSignatureLib {
  bytes32 internal constant DOMAIN_TYPEHASH =
    keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
  bytes32 internal constant NAME_HASH = keccak256("Aztec Rollup");
  bytes32 internal constant VERSION_HASH = keccak256("1");

  bytes32 internal constant BLOCK_PROPOSAL_TYPEHASH = keccak256("BlockProposal(bytes32 payloadHash)");
  bytes32 internal constant CHECKPOINT_PROPOSAL_TYPEHASH = keccak256("CheckpointProposal(bytes32 payloadHash)");
  bytes32 internal constant CHECKPOINT_ATTESTATION_TYPEHASH = keccak256("CheckpointAttestation(bytes32 payloadHash)");
  bytes32 internal constant ATTESTATIONS_AND_SIGNERS_TYPEHASH =
    keccak256("AttestationsAndSigners(bytes32 payloadHash)");

  function domainSeparator() internal view returns (bytes32) {
    return domainSeparator(address(this));
  }

  function domainSeparator(address _verifyingContract) internal view returns (bytes32) {
    return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, _verifyingContract));
  }

  function toTypedDataHash(bytes32 _structHash) internal view returns (bytes32) {
    return toTypedDataHash(_structHash, address(this));
  }

  function toTypedDataHash(bytes32 _structHash, address _verifyingContract) internal view returns (bytes32) {
    return keccak256(abi.encodePacked(hex"1901", domainSeparator(_verifyingContract), _structHash));
  }

  function blockProposalDigest(bytes32 _payloadHash) internal view returns (bytes32) {
    return blockProposalDigest(_payloadHash, address(this));
  }

  function blockProposalDigest(bytes32 _payloadHash, address _verifyingContract) internal view returns (bytes32) {
    return toTypedDataHash(keccak256(abi.encode(BLOCK_PROPOSAL_TYPEHASH, _payloadHash)), _verifyingContract);
  }

  function checkpointProposalDigest(bytes32 _payloadHash) internal view returns (bytes32) {
    return checkpointProposalDigest(_payloadHash, address(this));
  }

  function checkpointProposalDigest(bytes32 _payloadHash, address _verifyingContract) internal view returns (bytes32) {
    return toTypedDataHash(keccak256(abi.encode(CHECKPOINT_PROPOSAL_TYPEHASH, _payloadHash)), _verifyingContract);
  }

  function checkpointAttestationDigest(bytes32 _payloadHash) internal view returns (bytes32) {
    return checkpointAttestationDigest(_payloadHash, address(this));
  }

  function checkpointAttestationDigest(bytes32 _payloadHash, address _verifyingContract)
    internal
    view
    returns (bytes32)
  {
    return toTypedDataHash(keccak256(abi.encode(CHECKPOINT_ATTESTATION_TYPEHASH, _payloadHash)), _verifyingContract);
  }

  function attestationsAndSignersDigest(bytes32 _payloadHash) internal view returns (bytes32) {
    return attestationsAndSignersDigest(_payloadHash, address(this));
  }

  function attestationsAndSignersDigest(bytes32 _payloadHash, address _verifyingContract)
    internal
    view
    returns (bytes32)
  {
    return toTypedDataHash(keccak256(abi.encode(ATTESTATIONS_AND_SIGNERS_TYPEHASH, _payloadHash)), _verifyingContract);
  }
}
