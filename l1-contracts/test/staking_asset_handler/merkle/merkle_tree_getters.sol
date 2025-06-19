// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

contract MerkleTreeGetters is Test {
    function getRoot() internal returns (bytes32) {
        string[] memory inputs = new string[](2);
        inputs[0] = "node";
        inputs[1] = "test/staking_asset_handler/merkle/get-root.js";

        bytes memory result = vm.ffi(inputs);

        return bytes32(result);
    }

    function getAddress(uint256 index) internal returns (address) {
        string[] memory inputs = new string[](3);
        inputs[0] = "node";
        inputs[1] = "test/staking_asset_handler/merkle/get-address.js";
        inputs[2] = vm.toString(index);

        bytes memory result = vm.ffi(inputs);

        return address(uint160(uint256(bytes32(result))));
    }

    function getMerkleProof(uint256 index) internal returns (bytes32[] memory) {
        string[] memory inputs = new string[](3);
        inputs[0] = "node";
        inputs[1] = "test/staking_asset_handler/merkle/get-proof.js";
        inputs[2] = vm.toString(index);

        bytes memory result = vm.ffi(inputs);
        bytes32[] memory proof = abi.decode(result, (bytes32[]));

        return proof;
    }

    function getAddressAndProof(uint256 index) internal returns (address addr, bytes32[] memory proof) {
        string[] memory inputs = new string[](3);
        inputs[0] = "node";
        inputs[1] = "test/staking_asset_handler/merkle/get-address-and-proof.js";
        inputs[2] = vm.toString(index);

        bytes memory result = vm.ffi(inputs);
        (addr, proof) = abi.decode(result, (address, bytes32[]));
    }
}
