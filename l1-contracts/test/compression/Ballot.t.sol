// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Ballot, CompressedBallot, BallotLib} from "@aztec/governance/libraries/compressed-data/Ballot.sol";

contract BallotTest is Test {
  using BallotLib for CompressedBallot;
  using BallotLib for Ballot;

  function test_compress_uncompress(uint128 _yea, uint128 _nay) public pure {
    Ballot memory ballot = Ballot({yea: _yea, nay: _nay});

    CompressedBallot compressedBallot = ballot.compress();
    Ballot memory decompressedBallot = compressedBallot.decompress();

    assertEq(compressedBallot.getYea(), ballot.yea, "getYea");
    assertEq(compressedBallot.getNay(), ballot.nay, "getNay");

    assertEq(decompressedBallot.yea, ballot.yea, "decompressed yea");
    assertEq(decompressedBallot.nay, ballot.nay, "decompressed nay");
  }

  function test_updateYea(uint128 _yea, uint128 _nay) public pure {
    uint256 yea = bound(_yea, 0, type(uint128).max - 1);
    Ballot memory a = Ballot({yea: yea, nay: _nay});

    CompressedBallot b = a.compress();
    CompressedBallot c = b.updateYea(yea + 1);

    assertEq(c.getYea(), yea + 1, "c.getYea");
    assertEq(c.getNay(), _nay, "c.getNay");
    assertEq(c.getYea(), b.getYea() + 1, "c.getYea != b.getYea + 1");
  }

  function test_updateNay(uint128 _yea, uint128 _nay) public pure {
    uint256 nay = bound(_nay, 0, type(uint128).max - 1);
    Ballot memory a = Ballot({yea: _yea, nay: nay});

    CompressedBallot b = a.compress();
    CompressedBallot c = b.updateNay(nay + 1);

    assertEq(c.getYea(), _yea, "c.getYea");
    assertEq(c.getNay(), nay + 1, "c.getNay");
    assertEq(c.getNay(), b.getNay() + 1, "c.getNay != b.getNay + 1");
  }

  function test_addYea(uint128 _initialYea, uint128 _nay, uint128 _amount) public pure {
    uint256 initialYea = bound(_initialYea, 0, type(uint128).max / 2);
    uint256 amount = bound(_amount, 0, type(uint128).max / 2);

    Ballot memory a = Ballot({yea: initialYea, nay: _nay});
    CompressedBallot b = a.compress();
    CompressedBallot c = b.addYea(amount);

    assertEq(c.getYea(), initialYea + amount, "c.getYea after addYea");
    assertEq(c.getNay(), _nay, "c.getNay should remain unchanged");
  }

  function test_addNay(uint128 _yea, uint128 _initialNay, uint128 _amount) public pure {
    uint256 initialNay = bound(_initialNay, 0, type(uint128).max / 2);
    uint256 amount = bound(_amount, 0, type(uint128).max / 2);

    Ballot memory a = Ballot({yea: _yea, nay: initialNay});
    CompressedBallot b = a.compress();
    CompressedBallot c = b.addNay(amount);

    assertEq(c.getYea(), _yea, "c.getYea should remain unchanged");
    assertEq(c.getNay(), initialNay + amount, "c.getNay after addNay");
  }

  function test_addYeaMultipleTimes(uint128 _nay) public pure {
    CompressedBallot ballot = BallotLib.compress(Ballot({yea: 0, nay: _nay}));

    ballot = ballot.addYea(100);
    assertEq(ballot.getYea(), 100, "After first addYea");

    ballot = ballot.addYea(200);
    assertEq(ballot.getYea(), 300, "After second addYea");

    ballot = ballot.addYea(400);
    assertEq(ballot.getYea(), 700, "After third addYea");

    assertEq(ballot.getNay(), _nay, "Nay should remain unchanged");
  }

  function test_addNayMultipleTimes(uint128 _yea) public pure {
    CompressedBallot ballot = BallotLib.compress(Ballot({yea: _yea, nay: 0}));

    ballot = ballot.addNay(50);
    assertEq(ballot.getNay(), 50, "After first addNay");

    ballot = ballot.addNay(150);
    assertEq(ballot.getNay(), 200, "After second addNay");

    ballot = ballot.addNay(300);
    assertEq(ballot.getNay(), 500, "After third addNay");

    assertEq(ballot.getYea(), _yea, "Yea should remain unchanged");
  }

  function test_mixedOperations(uint128 _initialYea, uint128 _initialNay) public pure {
    uint256 initialYea = bound(_initialYea, 0, type(uint128).max / 4);
    uint256 initialNay = bound(_initialNay, 0, type(uint128).max / 4);

    Ballot memory initialBallot = Ballot({yea: initialYea, nay: initialNay});
    CompressedBallot ballot = initialBallot.compress();

    // Add to both yea and nay
    ballot = ballot.addYea(1000);
    ballot = ballot.addNay(500);

    assertEq(ballot.getYea(), initialYea + 1000, "Yea after operations");
    assertEq(ballot.getNay(), initialNay + 500, "Nay after operations");

    // Decompress and verify
    Ballot memory finalBallot = ballot.decompress();
    assertEq(finalBallot.yea, initialYea + 1000, "Final decompressed yea");
    assertEq(finalBallot.nay, initialNay + 500, "Final decompressed nay");
  }
}
