// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {Ownable} from "@oz/access/Ownable.sol";

// Phase 5 scaffolding for Phase 6 enforcement. `Portal.withdraw` will call
// `ECDSA.recover` on the TEE signature and check the recovered address against
// `isRegisteredTee`. Nothing wires into this contract yet - it just exists so the
// Phase 6 delta is purely additive.
contract TeeRegistry is Ownable {
    mapping(address tee => bool registered) public isRegisteredTee;

    event TeeAdded(address indexed tee);
    event TeeRemoved(address indexed tee);

    error ZeroAddress();
    error AlreadyRegistered();
    error NotRegistered();

    constructor(address _owner) Ownable(_owner) {}

    function addTee(address _tee) external onlyOwner {
        require(_tee != address(0), ZeroAddress());
        require(!isRegisteredTee[_tee], AlreadyRegistered());
        isRegisteredTee[_tee] = true;
        emit TeeAdded(_tee);
    }

    function removeTee(address _tee) external onlyOwner {
        require(isRegisteredTee[_tee], NotRegistered());
        isRegisteredTee[_tee] = false;
        emit TeeRemoved(_tee);
    }
}
