// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.21;

import {TestBase} from "test/base/TestBase.sol";
import {Fr, FrLib, P} from "src/honk/Fr.sol";
import {Errors} from "src/honk/Errors.sol";

contract FrLibWrapper {
    function pow(Fr a, uint256 b) public view returns (Fr) {
        return FrLib.pow(a, b);
    }

    function invert(Fr a) public view returns (Fr) {
        return FrLib.invert(a);
    }

    function batchInvert(Fr[] memory a) public view returns (Fr[] memory) {
        return FrLib.batchInvert(a);
    }

    function from(uint256 value) public view returns (Fr) {
        return FrLib.from(value);
    }

    function fromBytes32(bytes32 value) public view returns (Fr) {
        return FrLib.fromBytes32(value);
    }
}

contract FrLibTest is TestBase {
    FrLibWrapper public lib;

    function setUp() public {
        lib = new FrLibWrapper();
    }

    function test_fr_pow() public {
        Fr a = Fr.wrap(1);

        vm.expectRevert(Errors.NotPowerOfTwo.selector);
        lib.pow(a, 0);

        vm.expectRevert(Errors.NotPowerOfTwo.selector);
        lib.pow(a, 3);
    }

    function test_fr_invert() public {
        Fr a = Fr.wrap(0);

        vm.expectRevert(Errors.InvertOfZero.selector);
        lib.invert(a);
    }

    function test_fr_value_out_of_range() public {
        // Beware the danger of using wrap directly.
        Fr a = Fr.wrap(P + 1);

        vm.expectRevert(Errors.ValueGeFieldOrder.selector);
        lib.from(P + 1);
    }

    function test_fr_from_bytes32() public {
        bytes32 a = bytes32(uint256(P + 1));

        vm.expectRevert(Errors.ValueGeFieldOrder.selector);
        lib.fromBytes32(a);
    }

    // batchInvert must produce exactly the same results as inverting each element
    // individually, and each result must be a true multiplicative inverse.
    function test_batch_invert_matches_single_invert() public {
        Fr[] memory values = new Fr[](5);
        values[0] = Fr.wrap(1);
        values[1] = Fr.wrap(2);
        values[2] = Fr.wrap(0x1234567890abcdef);
        values[3] = Fr.wrap(P - 1);
        values[4] = Fr.wrap(7);

        Fr[] memory batched = lib.batchInvert(values);

        for (uint256 i = 0; i < values.length; i++) {
            assertEq(Fr.unwrap(batched[i]), Fr.unwrap(lib.invert(values[i])), "batch != single");
            assertEq(Fr.unwrap(values[i] * batched[i]), 1, "v * inv != 1");
        }
    }

    function test_batch_invert_empty() public {
        Fr[] memory values = new Fr[](0);
        Fr[] memory batched = lib.batchInvert(values);
        assertEq(batched.length, 0, "empty in, empty out");
    }

    function test_batch_invert_single() public {
        Fr[] memory values = new Fr[](1);
        values[0] = Fr.wrap(0xdeadbeef);
        Fr[] memory batched = lib.batchInvert(values);
        assertEq(batched.length, 1);
        assertEq(Fr.unwrap(batched[0]), Fr.unwrap(lib.invert(values[0])), "single mismatch");
        assertEq(Fr.unwrap(values[0] * batched[0]), 1, "v * inv != 1");
    }

    // A zero anywhere in the batch must revert exactly like invert(0) does.
    function test_batch_invert_reverts_on_zero_first() public {
        Fr[] memory values = new Fr[](3);
        values[0] = Fr.wrap(0);
        values[1] = Fr.wrap(3);
        values[2] = Fr.wrap(5);
        vm.expectRevert(Errors.InvertOfZero.selector);
        lib.batchInvert(values);
    }

    function test_batch_invert_reverts_on_zero_middle() public {
        Fr[] memory values = new Fr[](3);
        values[0] = Fr.wrap(3);
        values[1] = Fr.wrap(0);
        values[2] = Fr.wrap(5);
        vm.expectRevert(Errors.InvertOfZero.selector);
        lib.batchInvert(values);
    }

    function test_batch_invert_reverts_on_zero_last() public {
        Fr[] memory values = new Fr[](3);
        values[0] = Fr.wrap(3);
        values[1] = Fr.wrap(5);
        values[2] = Fr.wrap(0);
        vm.expectRevert(Errors.InvertOfZero.selector);
        lib.batchInvert(values);
    }

    function testFuzz_batch_invert(uint256 a, uint256 b, uint256 c) public {
        // Constrain into the field and away from zero (zero is covered by the revert tests).
        a = bound(a, 1, P - 1);
        b = bound(b, 1, P - 1);
        c = bound(c, 1, P - 1);

        Fr[] memory values = new Fr[](3);
        values[0] = Fr.wrap(a);
        values[1] = Fr.wrap(b);
        values[2] = Fr.wrap(c);

        Fr[] memory batched = lib.batchInvert(values);
        for (uint256 i = 0; i < values.length; i++) {
            assertEq(Fr.unwrap(batched[i]), Fr.unwrap(lib.invert(values[i])), "fuzz batch != single");
            assertEq(Fr.unwrap(values[i] * batched[i]), 1, "fuzz v * inv != 1");
        }
    }
}
