// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Signature} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {Slot, Epoch} from "@aztec/core/libraries/TimeMath.sol";

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
  Signature signature;
}

library EpochProofQuoteLib {
  bytes32 public constant EPOCH_PROOF_QUOTE_TYPEHASH = keccak256(
    "EpochProofQuote(uint256 epochToProve,uint256 validUntilSlot,uint256 bondAmount,address prover,uint32 basisPointFee)"
  );

  function hash(EpochProofQuote memory _quote) internal pure returns (bytes32) {
    return keccak256(
      abi.encode(
        EPOCH_PROOF_QUOTE_TYPEHASH,
        _quote.epochToProve,
        _quote.validUntilSlot,
        _quote.bondAmount,
        _quote.prover,
        _quote.basisPointFee
      )
    );
  }
}
