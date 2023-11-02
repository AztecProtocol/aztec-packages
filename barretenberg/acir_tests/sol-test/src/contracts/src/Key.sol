// Verification Key Hash: 08cb50f133d8799beba0350f03b7d0e56fe1ecabaa5dd3140d1078fa30182619
// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.4;

library UltraVerificationKey {
    function verificationKeyHash() internal pure returns(bytes32) {
        return 0x08cb50f133d8799beba0350f03b7d0e56fe1ecabaa5dd3140d1078fa30182619;
    }

    function loadVerificationKey(uint256 _vk, uint256 _omegaInverseLoc) internal pure {
        assembly {
            mstore(add(_vk, 0x00), 0x0000000000000000000000000000000000000000000000000000000000080000) // vk.circuit_size
            mstore(add(_vk, 0x20), 0x0000000000000000000000000000000000000000000000000000000000000010) // vk.num_inputs
            mstore(add(_vk, 0x40), 0x2260e724844bca5251829353968e4915305258418357473a5c1d597f613f6cbd) // vk.work_root
            mstore(add(_vk, 0x60), 0x3064486657634403844b0eac78ca882cfd284341fcb0615a15cfcd17b14d8201) // vk.domain_inverse
            mstore(add(_vk, 0x80), 0x12a0f5ff7d26c3826ac79b850f8ba31d24e07505751f1e4c70c8ed5919af08e1) // vk.Q1.x
            mstore(add(_vk, 0xa0), 0x161d4940c71cc45f179665eb090af82a9ba911b6736a2eea9d6cd966662205ff) // vk.Q1.y
            mstore(add(_vk, 0xc0), 0x159f7f8fbd9d64c5681c04aec9d3bf7997d899fa1f39485f1042f3ead3a105ca) // vk.Q2.x
            mstore(add(_vk, 0xe0), 0x0851200583ba0caae80442a2dd47358c6ab2bbed7b18f2225fd393d1426f0591) // vk.Q2.y
            mstore(add(_vk, 0x100), 0x18530c1f86d2cf6024fe31ca984ff8c062052499c08f3ba3b95e51adccfeec52) // vk.Q3.x
            mstore(add(_vk, 0x120), 0x1e5b70b70c84124466cea7a7caf88ee09a6b522d6066009422d0df4a2acdbd5d) // vk.Q3.y
            mstore(add(_vk, 0x140), 0x2062f85a4fbea66c0ac70fe0238a5b7d075050ff0dc53b46161d4364766e633a) // vk.Q4.x
            mstore(add(_vk, 0x160), 0x1e00321717ce90f481718f0a7e7a09769cb12ef948de1dccbb097b8d861696d1) // vk.Q4.y
            mstore(add(_vk, 0x180), 0x1b39889163aa4d888198d41c19a01494c55d3dc58e14308f212edc3e5ce4ecfc) // vk.Q_M.x
            mstore(add(_vk, 0x1a0), 0x29e99aa96ca6fa664d61f4dda17c908c364ede89c4c2e1492ef74f7d9a4c3946) // vk.Q_M.y
            mstore(add(_vk, 0x1c0), 0x2cd3d1930c3093ca25d7b6c0def3d80d2184cad58da3b94938bc5776b45c0899) // vk.Q_C.x
            mstore(add(_vk, 0x1e0), 0x2d7850284634606b54d9204c6a45fae05ce5ff7080e116237f97505f029f3728) // vk.Q_C.y
            mstore(add(_vk, 0x200), 0x0d818ab043ebe7c76f961eeb9dbc685456376e074c3cd22446e2361fc9d1e643) // vk.Q_ARITHMETIC.x
            mstore(add(_vk, 0x220), 0x20b6b3509ddbda7baebb9769923ca6046e3c7e816123aac254667d9a964908c5) // vk.Q_ARITHMETIC.y
            mstore(add(_vk, 0x240), 0x0e4d1f25873b71b1d3684fcd72f92ca43f0cae896706bedc7be7546cf3914372) // vk.QSORT.x
            mstore(add(_vk, 0x260), 0x20cca69394f8f64c8414dd1c93c76cf7fe1fa95200e64f6e239ab35dca89fb4e) // vk.QSORT.y
            mstore(add(_vk, 0x280), 0x303587022a3705d1918aec6b23296bc4631493b8f67844170c461ede54edf455) // vk.Q_ELLIPTIC.x
            mstore(add(_vk, 0x2a0), 0x1f184b6844676c182112a60ca447810251bb4a5b0f6acd975f66aca66e8bc54c) // vk.Q_ELLIPTIC.y
            mstore(add(_vk, 0x2c0), 0x1bbc5f8a33374772ae5af40f3d17cc07387e36d0feac1a6274421d24796e16be) // vk.Q_AUX.x
            mstore(add(_vk, 0x2e0), 0x0e9bc4472e9491328673c2118574c538fff863973449a6eca42b8285a3695002) // vk.Q_AUX.y
            mstore(add(_vk, 0x300), 0x0193ff19eca736a81fcd13b7822a7bda04e3ec791bba453a7678dca0a0e83418) // vk.SIGMA1.x
            mstore(add(_vk, 0x320), 0x11f8b1580d61fce65ac87d234e167bf2c1340d404905bb203c0853683dbc8ae4) // vk.SIGMA1.y
            mstore(add(_vk, 0x340), 0x24a473ad1cfd6dea405398e9d25999a03316e53ccdd39f47ce7fe8eb2aa56d7d) // vk.SIGMA2.x
            mstore(add(_vk, 0x360), 0x1ed15290b19173ab60dc6b961f0196bb6de6b6e0c9a0b61fedccb84f98807fc1) // vk.SIGMA2.y
            mstore(add(_vk, 0x380), 0x080ffc991b8c35f19951c8c717524213b416fdf5f603ff123b29771ccd78b325) // vk.SIGMA3.x
            mstore(add(_vk, 0x3a0), 0x09d3a6849ada0c8b666a9b3a6184560c7eadb5c8db92d630f6974e1d903f0446) // vk.SIGMA3.y
            mstore(add(_vk, 0x3c0), 0x0b65b24709ace712e4a67da7e2c7b6e05efc4847cfb6187a29d6b86a16db9982) // vk.SIGMA4.x
            mstore(add(_vk, 0x3e0), 0x2f5fea687f63d33de847a3cad2dbe3bbe4545089846e917120a2a10f4d5aa538) // vk.SIGMA4.y
            mstore(add(_vk, 0x400), 0x0ddc3b6d8e59cf0996ca71ad4132ca9d618ffd933cf58a8a0953dc76f97cf108) // vk.TABLE1.x
            mstore(add(_vk, 0x420), 0x153193287060386695f4f2d0d3525dec4c6a253f431d3f3fc06aa0e5b0448b8c) // vk.TABLE1.y
            mstore(add(_vk, 0x440), 0x1170f0ece62f8c572bca96b141d27f4bd25585edb9319128045c005d48491b1e) // vk.TABLE2.x
            mstore(add(_vk, 0x460), 0x246cd041690f653f88ed0c56ad282a3dd2e37b8edb1f56b785809d7710bf1c88) // vk.TABLE2.y
            mstore(add(_vk, 0x480), 0x26153c937447356a0c6d6be09d85eb34bc8a00ce9d452888e5fc2b5a7e14fed7) // vk.TABLE3.x
            mstore(add(_vk, 0x4a0), 0x189da022421fbd8dfd7973084d978e555388ad9364679246b07992f84b4e91b2) // vk.TABLE3.y
            mstore(add(_vk, 0x4c0), 0x285311c5e9a4cbb56a3f04f29d5443e8c0f9753e2a5a35acec051fafe2cecce5) // vk.TABLE4.x
            mstore(add(_vk, 0x4e0), 0x2436400260c9d3180beedd0bf49fec92d2d0ac76a1be7f1fad96cbd997175312) // vk.TABLE4.y
            mstore(add(_vk, 0x500), 0x2fc4d853b4c27e7e786acbdcf923f480b6319b64010387b20567a2a77c0af526) // vk.TABLE_TYPE.x
            mstore(add(_vk, 0x520), 0x2b622e477101c5031408649f94dca70af298e2674a43c0510732b8ecd497168b) // vk.TABLE_TYPE.y
            mstore(add(_vk, 0x540), 0x045773114cf89e3a78d27c460766f93348c6a41a91cfead506356b479bbf11f5) // vk.ID1.x
            mstore(add(_vk, 0x560), 0x144f66362e3d2c0358a1d9133b11c78c81755727c9596e527b794989481f5745) // vk.ID1.y
            mstore(add(_vk, 0x580), 0x0faf560e0a7b195a8438ce3752ff10b3aa25ef949b12058696ad41d3b5892c52) // vk.ID2.x
            mstore(add(_vk, 0x5a0), 0x1ccbcd7fc0e505b2b9fc826a909f0d5d96be17141fa7f7bb9c26ce80d4a216cc) // vk.ID2.y
            mstore(add(_vk, 0x5c0), 0x084785e3d73b6963b15b2dad4ee12c15a23e84837dc95d1ad8a93cdaf92a4eec) // vk.ID3.x
            mstore(add(_vk, 0x5e0), 0x2a26e01d253617b778db8ba08b9bc3f19f7ca9c514f6ee7bd39a0784e790e76a) // vk.ID3.y
            mstore(add(_vk, 0x600), 0x2c44a0d9719d3df20016b9475ba90e0e82cabbd6e00e14bb1fdc099199a67be3) // vk.ID4.x
            mstore(add(_vk, 0x620), 0x0b2cab5b56a3772a6eaf946d5a94bf85cef356d42e71db12960bba7848e5297b) // vk.ID4.y
            mstore(add(_vk, 0x640), 0x01) // vk.contains_recursive_proof
            mstore(add(_vk, 0x660), 0) // vk.recursive_proof_public_input_indices
            mstore(add(_vk, 0x680), 0x260e01b251f6f1c7e7ff4e580791dee8ea51d87a358e038b4efe30fac09383c1) // vk.g2_x.X.c1 
            mstore(add(_vk, 0x6a0), 0x0118c4d5b837bcc2bc89b5b398b5974e9f5944073b32078b7e231fec938883b0) // vk.g2_x.X.c0 
            mstore(add(_vk, 0x6c0), 0x04fc6369f7110fe3d25156c1bb9a72859cf2a04641f99ba4ee413c80da6a5fe4) // vk.g2_x.Y.c1 
            mstore(add(_vk, 0x6e0), 0x22febda3c0c0632a56475b4214e5615e11e6dd3f96e6cea2854a87d4dacc5e55) // vk.g2_x.Y.c0 
            mstore(_omegaInverseLoc, 0x06e402c0a314fb67a15cf806664ae1b722dbc0efe66e6c81d98f9924ca535321) // vk.work_root_inverse
        }
    }
}
