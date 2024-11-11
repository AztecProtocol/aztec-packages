// Verification Key Hash: a52397545a883471ee94e8a27e184be64d21640d76712b1e6fba67f3546503c9
// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.4;

library RecursiveUltraVerificationKey {
    function verificationKeyHash() internal pure returns (bytes32) {
        return 0xa52397545a883471ee94e8a27e184be64d21640d76712b1e6fba67f3546503c9;
    }

    function loadVerificationKey(uint256 _vk, uint256 _omegaInverseLoc) internal pure {
        assembly {
            mstore(add(_vk, 0x00), 0x0000000000000000000000000000000000000000000000000000000000080000) // vk.circuit_size
            mstore(add(_vk, 0x20), 0x0000000000000000000000000000000000000000000000000000000000000010) // vk.num_inputs
            mstore(add(_vk, 0x40), 0x2260e724844bca5251829353968e4915305258418357473a5c1d597f613f6cbd) // vk.work_root
            mstore(add(_vk, 0x60), 0x3064486657634403844b0eac78ca882cfd284341fcb0615a15cfcd17b14d8201) // vk.domain_inverse
            mstore(add(_vk, 0x80), 0x05104b486160545badec11f151e7c70b87050871da5653387ab4ab2ad0eef5ca) // vk.Q1.x
            mstore(add(_vk, 0xa0), 0x2672c7fb298fce83f510eb6e1b851a5bb2daf8fc43c7771e96c56c8a09ddfeae) // vk.Q1.y
            mstore(add(_vk, 0xc0), 0x2c019acf99c5663da83cec224bd32570ee90f45c4486a54dec3ca4552d8ab07a) // vk.Q2.x
            mstore(add(_vk, 0xe0), 0x0fb7a3385ab42cafb0e104ac17ac2dacfb161d292c00fca102b1e780e86ccaf3) // vk.Q2.y
            mstore(add(_vk, 0x100), 0x273ca9c29ef10864f4c9c053c336776a71ca5ebbf4bec1cb381e431943f9b5d7) // vk.Q3.x
            mstore(add(_vk, 0x120), 0x2a94f00fe384ab945a8f5e3c97194a425a4d2109e5b113f059e42ee232659436) // vk.Q3.y
            mstore(add(_vk, 0x140), 0x0e8b5c127c8a3ec285c2ac80d9046528051387878802203988a60650a0a960ab) // vk.Q4.x
            mstore(add(_vk, 0x160), 0x17efdb659ae0d26aa78db132f9be9130460c0fce0c2a8e9b726de68247f76891) // vk.Q4.y
            mstore(add(_vk, 0x180), 0x2f668d8a50bdb5c366e39433892f903262a04b6473ba3468c12057d58ad3bbfb) // vk.Q_M.x
            mstore(add(_vk, 0x1a0), 0x2397c6171bc6d084e98297690441c9da9f011d18b3ea0bb58ee4d47227feb6b4) // vk.Q_M.y
            mstore(add(_vk, 0x1c0), 0x1dafbfb4d30fcf880ef839ecc7fda9a97c315c5fa1713d08f7cdf6dba53ffb17) // vk.Q_C.x
            mstore(add(_vk, 0x1e0), 0x099fa3de9ce0cc28085739745582b53bf7939e3d97928afd491392053c1c0a68) // vk.Q_C.y
            mstore(add(_vk, 0x200), 0x028912be5d0accd4edf4949f89be1c1a2fcf4f59559ba03114da00ec3bf643ac) // vk.Q_ARITHMETIC.x
            mstore(add(_vk, 0x220), 0x2428952bfba8ba44830fb0ae6fcdeb9bf17d611add9432450ebbe3d928e2f431) // vk.Q_ARITHMETIC.y
            mstore(add(_vk, 0x240), 0x2b40c900824bcca193d402e0ef7f78792deaccd99743a78e5330abe8886ac989) // vk.QSORT.x
            mstore(add(_vk, 0x260), 0x102a7a02bc1a7317702c09560636e991b856f26f88ee8f0b33da3dd7fe222dbb) // vk.QSORT.y
            mstore(add(_vk, 0x280), 0x2bcf00433471db2be265df28ba2e70c36ca52f2932a4de25c0d60868703a0726) // vk.Q_ELLIPTIC.x
            mstore(add(_vk, 0x2a0), 0x2f225b86590c67ae48360cb41d5b291ba94ce2dbae850afd9a6854122341b5ba) // vk.Q_ELLIPTIC.y
            mstore(add(_vk, 0x2c0), 0x2eaee34d8508092cc4e19bc3f27ffa7dfc72230710e220f228f48906fae21e56) // vk.Q_AUX.x
            mstore(add(_vk, 0x2e0), 0x0c503c5d6245b99bbc056925e96abd20feaed6507707311092b3ed87eadb3874) // vk.Q_AUX.y
            mstore(add(_vk, 0x300), 0x021ba851cec3aedfbf1d9944907ae721f0d3e8fa3548513b6f108d101067ae85) // vk.SIGMA1.x
            mstore(add(_vk, 0x320), 0x24eef378da346c4f9eededc5dc519d35b14fec46412c8fcf7564cafb9843d761) // vk.SIGMA1.y
            mstore(add(_vk, 0x340), 0x0492b2fed8a158177dd3e825fb34ca7481bfead06bc01f308dc81fcd852ef3bc) // vk.SIGMA2.x
            mstore(add(_vk, 0x360), 0x289bf1bcc6a9cb19b102c7fb9dba839e1817a24257194cad404b393ce77e66b5) // vk.SIGMA2.y
            mstore(add(_vk, 0x380), 0x05d2a9c66d5c142b254b4f7d09f0eb837d95d8ec002e0644f51d455041403ca5) // vk.SIGMA3.x
            mstore(add(_vk, 0x3a0), 0x2434b76f470965c85363ff15b3f37c7b4be4fb2741451dc33943879f1e4cbba4) // vk.SIGMA3.y
            mstore(add(_vk, 0x3c0), 0x2f4bcc93500665a87a8f959e1636fe88cb1f17688b8c286fe930ccf934a49ac2) // vk.SIGMA4.x
            mstore(add(_vk, 0x3e0), 0x243f7b4ae1d483c99523b6a2999f404ab744017c8f43080c3582c38ea8ea3d1a) // vk.SIGMA4.y
            mstore(add(_vk, 0x400), 0x0ddc3b6d8e59cf0996ca71ad4132ca9d618ffd933cf58a8a0953dc76f97cf108) // vk.TABLE1.x
            mstore(add(_vk, 0x420), 0x153193287060386695f4f2d0d3525dec4c6a253f431d3f3fc06aa0e5b0448b8c) // vk.TABLE1.y
            mstore(add(_vk, 0x440), 0x1170f0ece62f8c572bca96b141d27f4bd25585edb9319128045c005d48491b1e) // vk.TABLE2.x
            mstore(add(_vk, 0x460), 0x246cd041690f653f88ed0c56ad282a3dd2e37b8edb1f56b785809d7710bf1c88) // vk.TABLE2.y
            mstore(add(_vk, 0x480), 0x26153c937447356a0c6d6be09d85eb34bc8a00ce9d452888e5fc2b5a7e14fed7) // vk.TABLE3.x
            mstore(add(_vk, 0x4a0), 0x189da022421fbd8dfd7973084d978e555388ad9364679246b07992f84b4e91b2) // vk.TABLE3.y
            mstore(add(_vk, 0x4c0), 0x285311c5e9a4cbb56a3f04f29d5443e8c0f9753e2a5a35acec051fafe2cecce5) // vk.TABLE4.x
            mstore(add(_vk, 0x4e0), 0x2436400260c9d3180beedd0bf49fec92d2d0ac76a1be7f1fad96cbd997175312) // vk.TABLE4.y
            mstore(add(_vk, 0x500), 0x139bb66456d96a4e2dad361f7949a6b8c6739650965ae729788162fbb0382399) // vk.TABLE_TYPE.x
            mstore(add(_vk, 0x520), 0x098fad1329e1765863f8ac829332168359901da71702e5119ce4b89a7ae6f017) // vk.TABLE_TYPE.y
            mstore(add(_vk, 0x540), 0x14fc4c6c2521387172a6b801e2b6c8a2308d725695d3f49a57151c2a0a8af0fe) // vk.ID1.x
            mstore(add(_vk, 0x560), 0x2ce0c2c73ded7bcf19c1208f134b67ed74f77ef717db1c05c010bc8df7bed39e) // vk.ID1.y
            mstore(add(_vk, 0x580), 0x0e2455a361f4a3741dab6a03b8186996a5a9873a3b62b3fa8eb5a551cb46bb7a) // vk.ID2.x
            mstore(add(_vk, 0x5a0), 0x29a288b84aeabb0421861492256c6ea82530b5b14c0e01e5b7b2553cf197a2e7) // vk.ID2.y
            mstore(add(_vk, 0x5c0), 0x01fbecd3bc90ad298a27bf4f9aa071746c30b5af932a1ba8d5b04394f85e0370) // vk.ID3.x
            mstore(add(_vk, 0x5e0), 0x0b21c924fc2b44729ff84deeae724c68dd1636e847b0f7cdd92ad203af7cf0d5) // vk.ID3.y
            mstore(add(_vk, 0x600), 0x12f7ebb5e50b429b766b1dc5e8b32b7727593641e4f976b72a7046d0a3ff8dea) // vk.ID4.x
            mstore(add(_vk, 0x620), 0x2d45226edb0f8338bb5fa88ecefeeaa9bbb72232a2e842f8c7f37cd11f7065ed) // vk.ID4.y
            mstore(add(_vk, 0x640), 0x01) // vk.contains_pairing_point_accumulator
            mstore(add(_vk, 0x660), 0) // vk.pairing_point_accumulator_public_input_indices
            mstore(add(_vk, 0x680), 0x260e01b251f6f1c7e7ff4e580791dee8ea51d87a358e038b4efe30fac09383c1) // vk.g2_x.X.c1
            mstore(add(_vk, 0x6a0), 0x0118c4d5b837bcc2bc89b5b398b5974e9f5944073b32078b7e231fec938883b0) // vk.g2_x.X.c0
            mstore(add(_vk, 0x6c0), 0x04fc6369f7110fe3d25156c1bb9a72859cf2a04641f99ba4ee413c80da6a5fe4) // vk.g2_x.Y.c1
            mstore(add(_vk, 0x6e0), 0x22febda3c0c0632a56475b4214e5615e11e6dd3f96e6cea2854a87d4dacc5e55) // vk.g2_x.Y.c0
            mstore(_omegaInverseLoc, 0x06e402c0a314fb67a15cf806664ae1b722dbc0efe66e6c81d98f9924ca535321) // vk.work_root_inverse
        }
    }
}
