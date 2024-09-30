// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {SignatureLib} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {EIP712Lib} from "@aztec/core/libraries/crypto/EIP712Lib.sol";
import {EpochProofQuoteLib} from "@aztec/core/libraries/EpochProofQuoteLib.sol";
import {Slot, Epoch} from "@aztec/core/libraries/TimeMath.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

// solhint-disable comprehensive-interface

contract TestSignatures is Test {
  function testQuoteSignatures() public {
    bytes32 separator = EIP712Lib.DOMAIN_SEPARATOR;
    EpochProofQuoteLib.EpochProofQuote memory _quote = EpochProofQuoteLib.EpochProofQuote({
      epochToProve: Epoch.wrap(42),
      validUntilSlot: Slot.wrap(100),
      bondAmount: 1000000000000000000,
      prover: 0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826,
      basisPointFee: 5000
    });
    assertEq(
      EpochProofQuoteLib.hash(_quote),
      0x4ed9cc91360dbd11218c8fcf4e8402f7a85d298dd4b4fb3d1fbcbb1a8ae72cc9,
      "Invalid quote hash"
    );

    bytes32 digest = EpochProofQuoteLib.toDigest(_quote, separator);

    assertEq(
      digest, 0x6927eba5b70276d7a9ccedac195c01844c8e71b3fdf9f8a5972914e8a2d5911d, "Invalid digest"
    );

    uint8 v = 27;
    bytes32 r = 0x63e9cf4ee71dcfeae09da434f3e7c2d5c336b7d83b78fbbbe6d1639b206b5b69;
    bytes32 s = 0x57b1e46efa6b388c4333c8dd40da6ec25297b6c277fba4f1b42e3b6f1d0ddfde;
    EpochProofQuoteLib.SignedEpochProofQuote memory _signedQuote = EpochProofQuoteLib
      .SignedEpochProofQuote({
      quote: _quote,
      signature: SignatureLib.Signature({isEmpty: false, v: v, r: r, s: s})
    });

    EpochProofQuoteLib.verify(_signedQuote, separator);

    _signedQuote = EpochProofQuoteLib.SignedEpochProofQuote({
      quote: _quote,
      signature: SignatureLib.Signature({isEmpty: true, v: v, r: r, s: s})
    });
    vm.expectRevert(abi.encodeWithSelector(Errors.SignatureLib__CannotVerifyEmpty.selector));
    EpochProofQuoteLib.verify(_signedQuote, separator);
  }
}
