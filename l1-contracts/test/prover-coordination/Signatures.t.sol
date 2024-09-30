// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {FeeJuicePortal} from "@aztec/core/FeeJuicePortal.sol";
import {Leonidas} from "@aztec/core/Leonidas.sol";

import {SignatureLib} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {EpochProofQuoteLib} from "@aztec/core/libraries/EpochProofQuoteLib.sol";
import {Slot, Epoch} from "@aztec/core/libraries/TimeMath.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

import {TestERC20} from "../TestERC20.sol";

import {SignatureChecker} from "@oz/utils/cryptography/SignatureChecker.sol";

// solhint-disable comprehensive-interface

contract TestSignatures is Test {
  Registry internal registry;
  Inbox internal inbox;
  Outbox internal outbox;
  Rollup internal rollup;
  TestERC20 internal testERC20;
  FeeJuicePortal internal feeJuicePortal;

  modifier setup() {
    registry = new Registry(address(this));
    testERC20 = new TestERC20();
    feeJuicePortal = new FeeJuicePortal(address(this));
    testERC20.mint(address(feeJuicePortal), Constants.FEE_JUICE_INITIAL_MINT);
    feeJuicePortal.initialize(
      address(registry), address(testERC20), bytes32(Constants.FEE_JUICE_ADDRESS)
    );
    rollup = new Rollup(feeJuicePortal, bytes32(0), address(this), new address[](0));
    _;
  }

  function testQuoteSignatures() public setup {
    EpochProofQuoteLib.EpochProofQuote memory _quote = EpochProofQuoteLib.EpochProofQuote({
      epochToProve: Epoch.wrap(42),
      validUntilSlot: Slot.wrap(100),
      bondAmount: 1e18,
      prover: 0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826,
      basisPointFee: 5000
    });
    assertEq(
      EpochProofQuoteLib.hash(_quote),
      0x4ed9cc91360dbd11218c8fcf4e8402f7a85d298dd4b4fb3d1fbcbb1a8ae72cc9,
      "Invalid quote hash"
    );

    bytes32 digest = rollup.quoteToDigest(_quote);

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

    SignatureChecker.isValidSignatureNow(
      _quote.prover, digest, SignatureLib.toBytes(_signedQuote.signature)
    );
  }

  function testEmptySignatures() public {
    EpochProofQuoteLib.EpochProofQuote memory _quote = EpochProofQuoteLib.EpochProofQuote({
      epochToProve: Epoch.wrap(42),
      validUntilSlot: Slot.wrap(100),
      bondAmount: 1000000000000000000,
      prover: 0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826,
      basisPointFee: 5000
    });
    uint8 v = 27;
    bytes32 r = 0x63e9cf4ee71dcfeae09da434f3e7c2d5c336b7d83b78fbbbe6d1639b206b5b69;
    bytes32 s = 0x57b1e46efa6b388c4333c8dd40da6ec25297b6c277fba4f1b42e3b6f1d0ddfde;
    EpochProofQuoteLib.SignedEpochProofQuote memory _signedQuote = EpochProofQuoteLib
      .SignedEpochProofQuote({
      quote: _quote,
      signature: SignatureLib.Signature({isEmpty: false, v: v, r: r, s: s})
    });
    bytes32 digest = rollup.quoteToDigest(_quote);

    vm.expectRevert();
    SignatureChecker.isValidSignatureNow(
      _quote.prover, digest, SignatureLib.toBytes(_signedQuote.signature)
    );
  }
}
