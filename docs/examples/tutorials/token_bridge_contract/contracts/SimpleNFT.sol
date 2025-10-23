// SPDX-License-Identifier: Apache-2.0
// docs:start:simple_nft
pragma solidity >=0.8.27;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract SimpleNFT is ERC721 {
    uint256 private _currentTokenId;

    constructor() ERC721("SimplePunk", "SPUNK") {}

    function mint(address to) external returns (uint256) {
        uint256 tokenId = _currentTokenId++;
        _mint(to, tokenId);
        return tokenId;
    }
}
// docs:end:simple_nft
