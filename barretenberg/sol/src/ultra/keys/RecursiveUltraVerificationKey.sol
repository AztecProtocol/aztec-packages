// Verification Key Hash: ddb343afc65263c7c9009910e035f96f50b0827580c10fd882bce1f58e633e62
// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.4;

library RecursiveUltraVerificationKey {
    function verificationKeyHash() internal pure returns (bytes32) {
        return 0xddb343afc65263c7c9009910e035f96f50b0827580c10fd882bce1f58e633e62;
    }

    function loadVerificationKey(uint256 _vk, uint256 _omegaInverseLoc) internal pure {
        assembly {
            mstore(add(_vk, 0x00), 0x0000000000000000000000000000000000000000000000000000000000080000) // vk.circuit_size
            mstore(add(_vk, 0x20), 0x0000000000000000000000000000000000000000000000000000000000000010) // vk.num_inputs
            mstore(add(_vk, 0x40), 0x2260e724844bca5251829353968e4915305258418357473a5c1d597f613f6cbd) // vk.work_root
            mstore(add(_vk, 0x60), 0x3064486657634403844b0eac78ca882cfd284341fcb0615a15cfcd17b14d8201) // vk.domain_inverse
            mstore(add(_vk, 0x80), 0x272fae13335cda7794aeee75c0d41e52cc626b07106135805edc8538ab41f6e8) // vk.Q1.x
            mstore(add(_vk, 0xa0), 0x266e1501fe1a3d602bbfb1bd408ac9b329686552d0578d8fa1a7d37444632eed) // vk.Q1.y
            mstore(add(_vk, 0xc0), 0x022635cac72d16d7a0175bea90ffd678d3d3681f97e64ccc9f399ac8a5da390f) // vk.Q2.x
            mstore(add(_vk, 0xe0), 0x1abe686aad406be6d8c4326713c4f134d8db7d8c1c57aaba22f593e132996636) // vk.Q2.y
            mstore(add(_vk, 0x100), 0x0ec435019f6a618bb2db375a5d1b9f2d0981df21b996bc488897e9bff237fdac) // vk.Q3.x
            mstore(add(_vk, 0x120), 0x1059e50efe134dff75de467d46b0b2363e2cc8a5b9f48aa758f5c895cf1e9685) // vk.Q3.y
            mstore(add(_vk, 0x140), 0x1b5ece1f2b6578612eca0fbc1f45742c440ee5246070152406d8ab66d2fe82c2) // vk.Q4.x
            mstore(add(_vk, 0x160), 0x25669e07536131b086ce8a414333b5ab214fea376e52fca87ed9ac7c4d26cbbc) // vk.Q4.y
            mstore(add(_vk, 0x180), 0x013c1867e784bae04da012ee7d227e0f920b31dae793d5da38ae999b4622c4a8) // vk.Q_M.x
            mstore(add(_vk, 0x1a0), 0x1ca9e804bffcd6403981d319a74f67c17c267e9ce077434d46b8cbadb2cb6748) // vk.Q_M.y
            mstore(add(_vk, 0x1c0), 0x30447104bc7eaf34835557b8412d1220076eec127c7277d7d144d05ee10a4c82) // vk.Q_C.x
            mstore(add(_vk, 0x1e0), 0x0990dafa12cf826c986537955e488e025f11674b56dd87e543f532d80b529b75) // vk.Q_C.y
            mstore(add(_vk, 0x200), 0x1ae04aa3fc4f2ee6afa525cbd6502819eb3e7572b59363323cc978af71eeb25b) // vk.Q_ARITHMETIC.x
            mstore(add(_vk, 0x220), 0x3031230737a7dad62b9fd25b9b9eb2a8f386bcbb2bde2f67e678dfd718deef7b) // vk.Q_ARITHMETIC.y
            mstore(add(_vk, 0x240), 0x070799795a4b36746d6bac7b3248a9f80dd83ae93c1d1108b621f869b78542ff) // vk.QSORT.x
            mstore(add(_vk, 0x260), 0x2acc6c19c519877bdf4f8f759b8f5c82dc6ff3790445120840418f782fe458d4) // vk.QSORT.y
            mstore(add(_vk, 0x280), 0x21f55b7e9b4c5cbf21301019074c0a0eab41c8e637f8787e72f9f745c6979b3c) // vk.Q_ELLIPTIC.x
            mstore(add(_vk, 0x2a0), 0x02e336c35d840241a188ffc7ad2c687f16ddd91356e9db9cc470af08db1ef180) // vk.Q_ELLIPTIC.y
            mstore(add(_vk, 0x2c0), 0x00b7eec617e68065a1071a17d8e92cf99add525ec3fc6f5823c3907c4ffd99f0) // vk.Q_AUX.x
            mstore(add(_vk, 0x2e0), 0x2d9f0066732a3c01f1cd02f728f0a812dc501e14cf04cfeaffc21c1a3022b33e) // vk.Q_AUX.y
            mstore(add(_vk, 0x300), 0x0c5fa25121f65b37bb77aec0bf0f4d2aab431783f4b91ba0dd317933f2e17f89) // vk.SIGMA1.x
            mstore(add(_vk, 0x320), 0x1309d7fda24de7944e3001a2d6b76bf26907f88266a9e4d421e4fe8b44ddb1a0) // vk.SIGMA1.y
            mstore(add(_vk, 0x340), 0x18b0a6981df715dd568928124d6391b5c3eb2ed5ea81398e4bfcc8145b472ae2) // vk.SIGMA2.x
            mstore(add(_vk, 0x360), 0x1de52e7527cd79cc104730bb8e0eed4e8ceb9d7329fcff263c462799031f6393) // vk.SIGMA2.y
            mstore(add(_vk, 0x380), 0x06bf8ffad5944fd5c2050fc6fbc13986c15d8119a137abfdb1a7b28226449fe5) // vk.SIGMA3.x
            mstore(add(_vk, 0x3a0), 0x0b57fba979288b60f6ebcfc420898525a14cf47686f0cef811624e023bd80588) // vk.SIGMA3.y
            mstore(add(_vk, 0x3c0), 0x127368c110772e90b135520c13c04a3c1233e57a1790139ceeb67ee15a5d7a29) // vk.SIGMA4.x
            mstore(add(_vk, 0x3e0), 0x2aef30ba9eea240feeac22cc8d97e9254d9575af9a19c66806235365556706c6) // vk.SIGMA4.y
            mstore(add(_vk, 0x400), 0x0ddc3b6d8e59cf0996ca71ad4132ca9d618ffd933cf58a8a0953dc76f97cf108) // vk.TABLE1.x
            mstore(add(_vk, 0x420), 0x153193287060386695f4f2d0d3525dec4c6a253f431d3f3fc06aa0e5b0448b8c) // vk.TABLE1.y
            mstore(add(_vk, 0x440), 0x1170f0ece62f8c572bca96b141d27f4bd25585edb9319128045c005d48491b1e) // vk.TABLE2.x
            mstore(add(_vk, 0x460), 0x246cd041690f653f88ed0c56ad282a3dd2e37b8edb1f56b785809d7710bf1c88) // vk.TABLE2.y
            mstore(add(_vk, 0x480), 0x26153c937447356a0c6d6be09d85eb34bc8a00ce9d452888e5fc2b5a7e14fed7) // vk.TABLE3.x
            mstore(add(_vk, 0x4a0), 0x189da022421fbd8dfd7973084d978e555388ad9364679246b07992f84b4e91b2) // vk.TABLE3.y
            mstore(add(_vk, 0x4c0), 0x285311c5e9a4cbb56a3f04f29d5443e8c0f9753e2a5a35acec051fafe2cecce5) // vk.TABLE4.x
            mstore(add(_vk, 0x4e0), 0x2436400260c9d3180beedd0bf49fec92d2d0ac76a1be7f1fad96cbd997175312) // vk.TABLE4.y
            mstore(add(_vk, 0x500), 0x1d76b979d3cdb568e4405b3125fdaf66d08713915ae51817ee645a588e9762a6) // vk.TABLE_TYPE.x
            mstore(add(_vk, 0x520), 0x2622ec83dd99999d8f14cb98cdee282c94e8ee6e662e6593e4e5400bd38b1cf5) // vk.TABLE_TYPE.y
            mstore(add(_vk, 0x540), 0x132cdcc3d715b32d30d688af15b5031fbeee02123092861e87b0598e4f71fb48) // vk.ID1.x
            mstore(add(_vk, 0x560), 0x2d128dd3f102e376cac4e8ff680a448a9d63e91de1db1fdd1b95f1de8564cb45) // vk.ID1.y
            mstore(add(_vk, 0x580), 0x0c3fe2f3b45a6677b4660e3121beb449edffa632dc6fb849879e2b11c955b004) // vk.ID2.x
            mstore(add(_vk, 0x5a0), 0x0b88923b3a9a7d1aa171a93866d809d293093c8123ff8ee7247aeb17c88bdb1c) // vk.ID2.y
            mstore(add(_vk, 0x5c0), 0x2ce478ea2b0fd325510c4219ae7c41c48ab83492826ff06813cdf261377997ed) // vk.ID3.x
            mstore(add(_vk, 0x5e0), 0x04a50f2694a401ab75d1786f887767daf01f79d28a068081a746ed182c4b3caf) // vk.ID3.y
            mstore(add(_vk, 0x600), 0x062d732ebc9718167a29d3f6de8a1e4d8d0fa59b7bcd7a77f6a37a25ec159b4c) // vk.ID4.x
            mstore(add(_vk, 0x620), 0x1774cf6438fbbc70c8ec7013a37a4450fef3515f4d954ed26aee520a8aad261d) // vk.ID4.y
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
