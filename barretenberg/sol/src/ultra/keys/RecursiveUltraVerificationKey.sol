// Verification Key Hash: adf7fcbdc3ab90920764d05aac762984b6f80e3dbc9cfdcef33d5d400525eb24
// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.4;

library RecursiveUltraVerificationKey {
    function verificationKeyHash() internal pure returns (bytes32) {
        return 0xadf7fcbdc3ab90920764d05aac762984b6f80e3dbc9cfdcef33d5d400525eb24;
    }

    function loadVerificationKey(uint256 _vk, uint256 _omegaInverseLoc) internal pure {
        assembly {
            mstore(add(_vk, 0x00), 0x0000000000000000000000000000000000000000000000000000000000080000) // vk.circuit_size
            mstore(add(_vk, 0x20), 0x0000000000000000000000000000000000000000000000000000000000000010) // vk.num_inputs
            mstore(add(_vk, 0x40), 0x2260e724844bca5251829353968e4915305258418357473a5c1d597f613f6cbd) // vk.work_root
            mstore(add(_vk, 0x60), 0x3064486657634403844b0eac78ca882cfd284341fcb0615a15cfcd17b14d8201) // vk.domain_inverse
            mstore(add(_vk, 0x80), 0x272fae13335cda7794aeee75c0d41e52cc626b07106135805edc8538ab41f6e8) // vk.Q1.x
            mstore(add(_vk, 0xa0), 0x266e1501fe1a3d602bbfb1bd408ac9b329686552d0578d8fa1a7d37444632eed) // vk.Q1.y
            mstore(add(_vk, 0xc0), 0x24800dd2d472844c3afd10284239c30707c9eb16192a65ab28eb79f59aff2943) // vk.Q2.x
            mstore(add(_vk, 0xe0), 0x2ae2c84daa90e63075555a436f030a9d8ae62780ec3b2a5f568627a214e53994) // vk.Q2.y
            mstore(add(_vk, 0x100), 0x1226970a5f06cfb38da166d6004e3d512ed6728a51f937b3073fcb396aa7372e) // vk.Q3.x
            mstore(add(_vk, 0x120), 0x0769098bf5dc607b7d6cd29a9b97db48f7703294d84754e48d1bc677c8c1f979) // vk.Q3.y
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
            mstore(add(_vk, 0x300), 0x20fa82863a6691e5e1d8b2b76fc7ea07fa5a91e81c313034a0baf1c059f16ed8) // vk.SIGMA1.x
            mstore(add(_vk, 0x320), 0x0b293e34397d00906293da08044b03d3923213ecb97932f1a7b693d7be591d26) // vk.SIGMA1.y
            mstore(add(_vk, 0x340), 0x09c74bb84de88d366afe6926889f5e60c6405fa393dbf3e65ac0405b8dc09162) // vk.SIGMA2.x
            mstore(add(_vk, 0x360), 0x235f8afe67a54eeb1b507a933e8f6602a18722258f69b811d5f10d2bdc67e40a) // vk.SIGMA2.y
            mstore(add(_vk, 0x380), 0x24d36ac3e040bba91e88393b6d87b98bd839aa4e72c4fe82f151a547220cdb87) // vk.SIGMA3.x
            mstore(add(_vk, 0x3a0), 0x2e19a2cf0df47c94ea8f443eaf781ab325a3a31f53c2cd47158b96cab77b4c26) // vk.SIGMA3.y
            mstore(add(_vk, 0x3c0), 0x299b063fd348d02720572abe377ec7267d5317a37201c1f9b79c8c6ee8597b97) // vk.SIGMA4.x
            mstore(add(_vk, 0x3e0), 0x04dd6ccd06bf4c458c06f0a839a703c76bf2c809a2b2df3f37227e2e345a47fc) // vk.SIGMA4.y
            mstore(add(_vk, 0x400), 0x11c514df4405308bdface3553201db9535ce40f1cceb593355737a2c0e1809c4) // vk.TABLE1.x
            mstore(add(_vk, 0x420), 0x23730ae1d6b51c53e9f341638ad156f217277de48f9cc50a19f4399a50e7c9b1) // vk.TABLE1.y
            mstore(add(_vk, 0x440), 0x14a7d7dd7a61a9fee9df1579e5c7a497f363ef06b373eaeef19745008e808935) // vk.TABLE2.x
            mstore(add(_vk, 0x460), 0x12b20d74592a31252375201ad5cfb6b91ada920288c6211aa61745cb1827142f) // vk.TABLE2.y
            mstore(add(_vk, 0x480), 0x0de228c86fdaae2337277757704862abc3968ebcdf3c66a4b4fe0e1452b04cfe) // vk.TABLE3.x
            mstore(add(_vk, 0x4a0), 0x2c01fc8d1605cdd5325bee69dd0a869cf94f6a48f0f322b16ac00dd1f58165d0) // vk.TABLE3.y
            mstore(add(_vk, 0x4c0), 0x1b3600e51a06913d585471e94f198abe613a4b6194247a3233c7a26b6fdb5447) // vk.TABLE4.x
            mstore(add(_vk, 0x4e0), 0x15eb45af241222240bc8446a0410ff960dd88b8d9720bc13e8eb57be89be891b) // vk.TABLE4.y
            mstore(add(_vk, 0x500), 0x0221ee1e654253fcaa3ffdd7ccca0cce2c8c25bd391e4a6f26fe21f15853a06f) // vk.TABLE_TYPE.x
            mstore(add(_vk, 0x520), 0x29c6259ed3ff4e54d067340ec91ec5185f741622fb2a0a5432f06777f6158fdb) // vk.TABLE_TYPE.y
            mstore(add(_vk, 0x540), 0x2611a5db278d94912ccee81a829f45895a7444c2d084506d0d1f0ecdfccdc758) // vk.ID1.x
            mstore(add(_vk, 0x560), 0x0134f8df4f1f8b8058266bb3f83b001810fd520577fbdbb738dae189be463b05) // vk.ID1.y
            mstore(add(_vk, 0x580), 0x09cf92cea1bef8594f4c76cc9ef8a05b05310cce7863ad5fc25ceddfc70e3d31) // vk.ID2.x
            mstore(add(_vk, 0x5a0), 0x2e1ffaf9dcceb1d647c48f30083ec38a2cf10f90c972762a552a939dbcd9a0be) // vk.ID2.y
            mstore(add(_vk, 0x5c0), 0x0edaab035bd27f0f4b32aee13aa3177ddaabede322c351d0372a5d34eaa02bcb) // vk.ID3.x
            mstore(add(_vk, 0x5e0), 0x17f7c240033409c394ae8c3b0fde30166e005566108852aec3b32206b96a68dc) // vk.ID3.y
            mstore(add(_vk, 0x600), 0x1b032411cf6636fb43b3dfa8960a2aee106cea208de111f4d512cd88d640fe79) // vk.ID4.x
            mstore(add(_vk, 0x620), 0x11e4ec47b80d1ee3c51058086e553098c2959807e0ec3365e848214a8cd4e05b) // vk.ID4.y
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
