// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {IPredicate} from "../IPredicate.sol";

contract MockPredicate is IPredicate {
    bool public shouldPass;

    constructor(bool _shouldPass) {
        shouldPass = _shouldPass;
    }

    function setShouldPass(bool _shouldPass) external {
        shouldPass = _shouldPass;
    }

    function verify(address, bytes calldata) external view returns (bool) {
        return shouldPass;
    }
}
