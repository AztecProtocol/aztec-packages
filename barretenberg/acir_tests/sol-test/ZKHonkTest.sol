// THIS FILE WILL NOT COMPILE BY ITSELF
// Compilation is handled in `src/index.js` where solcjs gathers the dependencies

pragma solidity >=0.8.4;

import {HonkVerifier} from "./ZKVerifier.sol";

contract Test {
    HonkVerifier verifier;

    constructor() {
        verifier = new HonkVerifier();
    }

    function test(bytes calldata proof, bytes32[] calldata publicInputs) public view returns (bool) {
        return verifier.verify(proof, publicInputs);
    }
}
