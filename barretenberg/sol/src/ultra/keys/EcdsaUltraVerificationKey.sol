// Verification Key Hash: 1b6d47d8bbc292f738fbdb683f31b1290dacdd0a817e4f9c5785110c39354594
// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.4;

library EcdsaUltraVerificationKey {
    function verificationKeyHash() internal pure returns (bytes32) {
        return 0x1b6d47d8bbc292f738fbdb683f31b1290dacdd0a817e4f9c5785110c39354594;
    }

    function loadVerificationKey(uint256 _vk, uint256 _omegaInverseLoc) internal pure {
        assembly {
            mstore(add(_vk, 0x00), 0x0000000000000000000000000000000000000000000000000000000000010000) // vk.circuit_size
            mstore(add(_vk, 0x20), 0x0000000000000000000000000000000000000000000000000000000000000006) // vk.num_inputs
            mstore(add(_vk, 0x40), 0x00eeb2cb5981ed45649abebde081dcff16c8601de4347e7dd1628ba2daac43b7) // vk.work_root
            mstore(add(_vk, 0x60), 0x30641e0e92bebef818268d663bcad6dbcfd6c0149170f6d7d350b1b1fa6c1001) // vk.domain_inverse
            mstore(add(_vk, 0x80), 0x1cc85a07fb1009e23540957b29121dc57aaae5b1e89a22a932a1bdf7ccac1af2) // vk.Q1.x
            mstore(add(_vk, 0xa0), 0x19a1a4fa6d8781abbcb696097c1817f54da296348a292954e2aa9856f2fa3b6a) // vk.Q1.y
            mstore(add(_vk, 0xc0), 0x0409f05fe2901e7e339b3aaf0d7af7b5d4023e416da923321b15aae633b18fee) // vk.Q2.x
            mstore(add(_vk, 0xe0), 0x0ae6cc44e9024c190ab310d7ad110226c5c76f15d158b60fc9acd98f2e1f1aa3) // vk.Q2.y
            mstore(add(_vk, 0x100), 0x20e3b4e35df25ba02ac2a9be26bc6fe74640355e57455598e69922b8d3fd0939) // vk.Q3.x
            mstore(add(_vk, 0x120), 0x1f49d18bdb86a449e676558c6d6349f123372641187e33e12128ee7468431942) // vk.Q3.y
            mstore(add(_vk, 0x140), 0x00e95627d4db555ccf3b1ee6def34fab1a815f0482cb6a745a363940d3163831) // vk.Q4.x
            mstore(add(_vk, 0x160), 0x19fe011a8a139da323b5ce5abebe54bf4c105acd6045d7b2b5df40a34411f44b) // vk.Q4.y
            mstore(add(_vk, 0x180), 0x04b41648960da31317eff66b5ca9be0a6c81ebeead27e70b3c5b28d4aba11081) // vk.Q_M.x
            mstore(add(_vk, 0x1a0), 0x1bff2df21a3fd9c49c29b7f7c153dd0bc331d75afc6a35fb7155c17bb0f67a63) // vk.Q_M.y
            mstore(add(_vk, 0x1c0), 0x15faa2ea86a6a66cd9b969d6305f863595a73b9215c1ae442969f4993a8e5230) // vk.Q_C.x
            mstore(add(_vk, 0x1e0), 0x26391cc92544b485d90313d3396b53d9207db8f84ead11bcf45467fa7eb38b94) // vk.Q_C.y
            mstore(add(_vk, 0x200), 0x01a0d650b65d29965e4ae2a8cfb69470d7560f0826268da59c6e72e684a06c9b) // vk.Q_ARITHMETIC.x
            mstore(add(_vk, 0x220), 0x2248d4a02e68036c8d0a4a6725ba0e5e8e95950a5285a3a7daa1a1726cc8ec6b) // vk.Q_ARITHMETIC.y
            mstore(add(_vk, 0x240), 0x01afcbad715a0c382971311ad6fe4ff8b6e99200162aeb6245b585c99c8748a9) // vk.QSORT.x
            mstore(add(_vk, 0x260), 0x18bf352081d1ba2ffe8088d34ce6471e4cf6d2ee63f006ea9a5e31cc41b6587c) // vk.QSORT.y
            mstore(add(_vk, 0x280), 0x21245d6c0a4d2ff12b21a825f39f30e8f8cf9b259448d111183e975828539576) // vk.Q_ELLIPTIC.x
            mstore(add(_vk, 0x2a0), 0x16a409532c8a1693536e93b6ce9920bfc2e6796e8dfe404675a0cdf6ee77ee7a) // vk.Q_ELLIPTIC.y
            mstore(add(_vk, 0x2c0), 0x2d455f287e41544fd3744bab412640fd6916b01aa2163c84071eb47f0306a473) // vk.Q_AUX.x
            mstore(add(_vk, 0x2e0), 0x09dea8e2b5e382a1c4a37bc4e60f5e8380688310b855c249d64153478d25e223) // vk.Q_AUX.y
            mstore(add(_vk, 0x300), 0x09671927e293b22a3fb9fa8ea1680fcc4570bb2f312cb88004ff7fd4474e2109) // vk.SIGMA1.x
            mstore(add(_vk, 0x320), 0x1c6442d9a49b3b93a928ef6ba2f348bc4c8cb778a59345faf7d173129f22b5a3) // vk.SIGMA1.y
            mstore(add(_vk, 0x340), 0x0337d84b45a5abc701edbdc1a1d878178c23496b39ccddcc3f0f6199e3f97df6) // vk.SIGMA2.x
            mstore(add(_vk, 0x360), 0x1c744f7be93d40c96d15fdf9d81c9502b7018573ad23e51dea7b065fdeb6f13a) // vk.SIGMA2.y
            mstore(add(_vk, 0x380), 0x23a975cfb71f0c0d46ef9c0b01e6482e780b5e3af1a63547f7d01c46c1911699) // vk.SIGMA3.x
            mstore(add(_vk, 0x3a0), 0x0d5a0be212cb2c7d3bba8c2406a9d2c4b04d4e64b0acef2681eb7c6aa490a7cb) // vk.SIGMA3.y
            mstore(add(_vk, 0x3c0), 0x1ca2d0cca80bb16eab28d06c5c175e862a8ef14bceb6da79e65236a8a6a36838) // vk.SIGMA4.x
            mstore(add(_vk, 0x3e0), 0x0555fe3dbd2ba2d7db2b5f740bf32fb57f4c5ac9d9f2e59e9a5a2cc2d84dae05) // vk.SIGMA4.y
            mstore(add(_vk, 0x400), 0x18f7cf965339d9c9d190296fa92f915767b0a8da455975f3e03fa98439fd7110) // vk.TABLE1.x
            mstore(add(_vk, 0x420), 0x0eecc02f9d44125407adbf00d56b086afd1adc5de536450afe05de382761b32f) // vk.TABLE1.y
            mstore(add(_vk, 0x440), 0x0bdfe662ea9f40f125ca5f7e99a8c6ba09b87ba8313864316745df862946c5c4) // vk.TABLE2.x
            mstore(add(_vk, 0x460), 0x0c5313c5b17634332920f54081fd46464a5ce9399e507c8fece9df28bff19033) // vk.TABLE2.y
            mstore(add(_vk, 0x480), 0x232ab86409f60c50fd5f04e879fbcbe60e358eb0337c5d0db1934277e1d8b1f2) // vk.TABLE3.x
            mstore(add(_vk, 0x4a0), 0x1fda66dfb58273345f2471dff55c51b6856241460272e64b4cc67cde65231e89) // vk.TABLE3.y
            mstore(add(_vk, 0x4c0), 0x024ccc0fcff3b515cdc97dde2fae5c516bf3c97207891801707142af02538a83) // vk.TABLE4.x
            mstore(add(_vk, 0x4e0), 0x27827250d02b7b67d084bfc52b26c722f33f75ae5098c109573bfe92b782e559) // vk.TABLE4.y
            mstore(add(_vk, 0x500), 0x22b1d6b9827d6d03049f76dc9dc219ae6de93abe52d4d7de8677d961d3408c77) // vk.TABLE_TYPE.x
            mstore(add(_vk, 0x520), 0x10ebc6be9f74e0367276028c613ab3efe0f2ed546c05339b36d5165d009c833a) // vk.TABLE_TYPE.y
            mstore(add(_vk, 0x540), 0x2aa2e5247ce6524fecba0a2de9f383353096665f3ae8082fe7017fbf6d6572d8) // vk.ID1.x
            mstore(add(_vk, 0x560), 0x1db802f61a6194bea68f7d5ec697facf26f1c1336b09e382801e8b773f0e116f) // vk.ID1.y
            mstore(add(_vk, 0x580), 0x1aa955e508f3c2fbf55a36719eb666a45239935c4af10b8a1f4580d5cd614236) // vk.ID2.x
            mstore(add(_vk, 0x5a0), 0x2bc21aa51420951a10a39d5c5242101d2207c47a0077852acb7d3fd6a16e1c58) // vk.ID2.y
            mstore(add(_vk, 0x5c0), 0x245c89c4cf7c7e297b4db8e2625f5abd56398c351256a39aece0a36a940aaf62) // vk.ID3.x
            mstore(add(_vk, 0x5e0), 0x01bd6e61d801d895c7edfee071518761f3c8c0e10bec5f0fb0b25ae430a2c91e) // vk.ID3.y
            mstore(add(_vk, 0x600), 0x30223d4653291c03019e96bd716769c7c6d6520fddf2e633a75f94b08bee86dd) // vk.ID4.x
            mstore(add(_vk, 0x620), 0x2e389428afa291855039f1b4af22e70d469f4e20116b85889737d624a2d27fef) // vk.ID4.y
            mstore(add(_vk, 0x640), 0x00) // vk.contains_pairing_point_accumulator
            mstore(add(_vk, 0x660), 0) // vk.pairing_point_accumulator_public_input_indices
            mstore(add(_vk, 0x680), 0x260e01b251f6f1c7e7ff4e580791dee8ea51d87a358e038b4efe30fac09383c1) // vk.g2_x.X.c1
            mstore(add(_vk, 0x6a0), 0x0118c4d5b837bcc2bc89b5b398b5974e9f5944073b32078b7e231fec938883b0) // vk.g2_x.X.c0
            mstore(add(_vk, 0x6c0), 0x04fc6369f7110fe3d25156c1bb9a72859cf2a04641f99ba4ee413c80da6a5fe4) // vk.g2_x.Y.c1
            mstore(add(_vk, 0x6e0), 0x22febda3c0c0632a56475b4214e5615e11e6dd3f96e6cea2854a87d4dacc5e55) // vk.g2_x.Y.c0
            mstore(_omegaInverseLoc, 0x0b5d56b77fe704e8e92338c0082f37e091126414c830e4c6922d5ac802d842d4) // vk.work_root_inverse
        }
    }
}
