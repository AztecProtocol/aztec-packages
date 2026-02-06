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
}
