// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {AddressSnapshotLib, SnapshottedAddressSet} from "@aztec/core/interfaces/IStaking.sol";

contract LibTest {
    SnapshottedAddressSet validatorSet;

    function add(address _validator) public {
        AddressSnapshotLib.add(validatorSet, _validator);
    }

    function remove(uint256 _index) public {
        AddressSnapshotLib.remove(validatorSet, _index);
    }

    function getValidatorInIndexNow(uint256 _index) public view returns (address) {
        return AddressSnapshotLib.getValidatorInIndexNow(validatorSet, _index);
    }

    function getAddresssIndexAt(uint256 _index, uint256 _epoch) public view returns (address) {
        return AddressSnapshotLib.getAddresssIndexAt(validatorSet, _index, _epoch);
    }
}

contract AddressSnapshotsTest is Test {
    LibTest libTest;
    function setUp() public {
        libTest = new LibTest();
    }

    function cheat__setEpochNow(uint256 _epoch) public {
        // TODO: set the storage directly in the TimeLib
        vm.warp(block.timestamp + _epoch);
    }

    function test_getValidatorInIndexNow() public {
        // Empty should return 0
        assertEq(libTest.getValidatorInIndexNow(0), address(0));

        libTest.add(address(1));
        libTest.add(address(2));
        libTest.add(address(3));

        assertEq(libTest.getValidatorInIndexNow(0), address(1));
        assertEq(libTest.getValidatorInIndexNow(1), address(2));
        assertEq(libTest.getValidatorInIndexNow(2), address(3));
    }

    function test_getAddresssIndexAt() public {
        // Empty should return 0
        assertEq(libTest.getAddresssIndexAt(0, 1), address(0));

        // Adds validator 1 to the first index in the set, at epoch 1
        libTest.add(address(1));
        assertEq(libTest.getAddresssIndexAt(/* index */ 0, /* epoch */ 1), address(1));

        // Remove index 0 from the set, in the new epoch
        libTest.remove(/* index */ 0);
        assertEq(libTest.getAddresssIndexAt(/* index */ 0, /* epoch */ 2), address(0));

        // Add validator 2 to the first index in the set
        libTest.add(address(2));
        assertEq(libTest.getAddresssIndexAt(/* index */ 0, /* epoch */ 3), address(2));

        // Setup and remove the last item in the set alot of times
        libTest.remove(/* index */ 0);
        libTest.add(address(3));
        assertEq(libTest.getAddresssIndexAt(/* index */ 0, /* epoch */ 5), address(3));

        libTest.remove(/* index */ 0);
        libTest.add(address(4));
        assertEq(libTest.getAddresssIndexAt(/* index */ 0, /* epoch */ 7), address(4));

        // Expect past values to be maintained
        assertEq(libTest.getAddresssIndexAt(/* index */ 0, /* epoch */ 1), address(1));
        assertEq(libTest.getAddresssIndexAt(/* index */ 0, /* epoch */ 2), address(0));
        assertEq(libTest.getAddresssIndexAt(/* index */ 0, /* epoch */ 3), address(2));
        assertEq(libTest.getAddresssIndexAt(/* index */ 0, /* epoch */ 4), address(0));
        assertEq(libTest.getAddresssIndexAt(/* index */ 0, /* epoch */ 5), address(3));
        assertEq(libTest.getAddresssIndexAt(/* index */ 0, /* epoch */ 6), address(0));
        assertEq(libTest.getAddresssIndexAt(/* index */ 0, /* epoch */ 7), address(4));
    }

}
