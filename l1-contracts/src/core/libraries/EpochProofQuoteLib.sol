// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Slot, Epoch} from "@aztec/core/libraries/TimeMath.sol";
import {SignatureLib} from "@aztec/core/libraries/crypto/SignatureLib.sol";

library EpochProofQuoteLib {
  /**
   * @notice Struct encompassing an epoch proof quote
   * @param epochToProve - The epoch number to prove
   * @param validUntilSlot - The deadline of the quote, denoted in L2 slots
   * @param bondAmount - The size of the bond
   * @param prover - The address of the prover
   * @param basisPointFee - The fee measured in basis points
   */
  struct EpochProofQuote {
    Epoch epochToProve;
    Slot validUntilSlot;
    uint256 bondAmount;
    address prover;
    uint32 basisPointFee;
  }

  /**
   * @notice A signed quote for the epoch proof
   * @param quote - The Epoch Proof Quote
   * @param signature - A signature on the quote
   */
  struct SignedEpochProofQuote {
    EpochProofQuote quote;
    SignatureLib.Signature signature;
  }

  bytes32 public constant EPOCH_PROOF_QUOTE_TYPEHASH = keccak256(
    "EpochProofQuote(uint256 epochToProve,uint256 validUntilSlot,uint256 bondAmount,address prover,uint32 basisPointFee)"
  );

  function hash(EpochProofQuote memory quote) internal pure returns (bytes32) {
    return keccak256(
      abi.encode(
        EPOCH_PROOF_QUOTE_TYPEHASH,
        quote.epochToProve,
        quote.validUntilSlot,
        quote.bondAmount,
        quote.prover,
        quote.basisPointFee
      )
    );
  }

  function toDigest(EpochProofQuote memory quote, bytes32 domainSeparator)
    internal
    pure
    returns (bytes32)
  {
    return keccak256(abi.encodePacked("\x19\x01", domainSeparator, hash(quote)));
  }

  function verify(SignedEpochProofQuote memory quote, bytes32 domainSeparator) internal pure {
    bytes32 digest = toDigest(quote.quote, domainSeparator);
    SignatureLib.verify(quote.signature, quote.quote.prover, digest);
  }
}
