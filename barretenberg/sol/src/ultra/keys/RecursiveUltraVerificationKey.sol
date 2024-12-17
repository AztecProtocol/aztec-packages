// Verification Key Hash: adc650afad19b93b5386b2fdf0259122332324d92e1c9293862c797b9b2829f6
// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.4;

library RecursiveUltraVerificationKey {
    function verificationKeyHash() internal pure returns (bytes32) {
        return 0xadc650afad19b93b5386b2fdf0259122332324d92e1c9293862c797b9b2829f6;
    }

    function loadVerificationKey(uint256 _vk, uint256 _omegaInverseLoc) internal pure {
        assembly {
            mstore(add(_vk, 0x00), 0x0000000000000000000000000000000000000000000000000000000000080000) // vk.circuit_size
            mstore(add(_vk, 0x20), 0x0000000000000000000000000000000000000000000000000000000000000010) // vk.num_inputs
            mstore(add(_vk, 0x40), 0x2260e724844bca5251829353968e4915305258418357473a5c1d597f613f6cbd) // vk.work_root
            mstore(add(_vk, 0x60), 0x3064486657634403844b0eac78ca882cfd284341fcb0615a15cfcd17b14d8201) // vk.domain_inverse
            mstore(add(_vk, 0x80), 0x1478e4518c7712fd4093ee39b8c6476768e3786cf20f0facb22889ef136668de) // vk.Q1.x
            mstore(add(_vk, 0xa0), 0x079dc4d86d1d3dc1b882227075b1022d69752ee12e520188927c75963f3eb9eb) // vk.Q1.y
            mstore(add(_vk, 0xc0), 0x12e845a150ba496b728fb574f2f1f5bb091b3f5cb5d33a9bdacb49436ec87397) // vk.Q2.x
            mstore(add(_vk, 0xe0), 0x0b97b4e989179d947012590634e870f646f2f4d043fb54b9de3d8c4d02699de8) // vk.Q2.y
            mstore(add(_vk, 0x100), 0x14e0cb4a27d4c90de4200d60dde03d21f8127d60d5f6bf75f1dcb9a6d677126b) // vk.Q3.x
            mstore(add(_vk, 0x120), 0x17dcff3ba1c1a1002c77765359b61ce59f35fd78155b049897ee207c0d3dfe37) // vk.Q3.y
            mstore(add(_vk, 0x140), 0x28af9bf3870b20a98c14402f8db5f1a1bbadb359e060864fa8312e19d7605297) // vk.Q4.x
            mstore(add(_vk, 0x160), 0x0b51dbf8b2ce0091b068270fd4185d4498217af1711c51f587fb3a8ba98fb2a1) // vk.Q4.y
            mstore(add(_vk, 0x180), 0x10acb0c0d0ef9c215b38743ef25f5aef38db1f645ada15c6d20a1036fb4714b6) // vk.Q_M.x
            mstore(add(_vk, 0x1a0), 0x08274c6be14dfcd2404b286c088ae43e06d509594d9d493f0a4f04bdeeeddab3) // vk.Q_M.y
            mstore(add(_vk, 0x1c0), 0x0a0093ed84243970e5e11dd7e5bd559c37a8cf4c25cbddef45c69c65a2e162a7) // vk.Q_C.x
            mstore(add(_vk, 0x1e0), 0x0b7ad27968c34862823b40f2b285bbead87c13b63304d713829839f38f3b2591) // vk.Q_C.y
            mstore(add(_vk, 0x200), 0x07756061540a87ac98b38b15ea2f36c77b475a4ccad7afc7d451c1c0edefaa09) // vk.Q_ARITHMETIC.x
            mstore(add(_vk, 0x220), 0x0ff2581f4d3db0cd5cd28f7fd4d9e75cbcb0c068ebed8013a58a59825acd9768) // vk.Q_ARITHMETIC.y
            mstore(add(_vk, 0x240), 0x0230bfafd461feb33c81dcc25d0f0897e4ee54815ca88aa999bd967aec56b54d) // vk.QSORT.x
            mstore(add(_vk, 0x260), 0x018bf31ee13697779502f165b104e39d176c9a01b84ad0d23adcb9c2f8ed3308) // vk.QSORT.y
            mstore(add(_vk, 0x280), 0x18296914d586e3a5be3b98a2e468d5c3fa776b423f34b66af9cf972c34949955) // vk.Q_ELLIPTIC.x
            mstore(add(_vk, 0x2a0), 0x1e61c1e52a9856ec8fc93e6e7135d995a4884e1efaa4c5566e90d72bf7523422) // vk.Q_ELLIPTIC.y
            mstore(add(_vk, 0x2c0), 0x03c9f22ebd6da88ef332b899729859d573c7b09234fa1f0d5348753b92cb04b8) // vk.Q_AUX.x
            mstore(add(_vk, 0x2e0), 0x181948786294561f868064d029bb441b0ca751871b55c84b7351ad665784b468) // vk.Q_AUX.y
            mstore(add(_vk, 0x300), 0x1da9dde287ae53e8080770430094baa6743fdd7fadae2c60e473de06958bcd23) // vk.SIGMA1.x
            mstore(add(_vk, 0x320), 0x0769dae8155e0c180af4b08cc3e5be6ef0cb617c9c998cb38af6a85aa4095b18) // vk.SIGMA1.y
            mstore(add(_vk, 0x340), 0x05d277f3eac4c36eedb3e49f36864c527230ab9259b846b183d8bb73e432d9cf) // vk.SIGMA2.x
            mstore(add(_vk, 0x360), 0x06bb19e0696af62b1ffbf565da66826f623351599c2c98e8829ffbfd49d69840) // vk.SIGMA2.y
            mstore(add(_vk, 0x380), 0x040e77049677d6919017f25124e4f3f41bdfc80ab8042b0b553ed886433cda4c) // vk.SIGMA3.x
            mstore(add(_vk, 0x3a0), 0x213db0d8e5a73eb96b385a766beab54edae6c758752510be04898b5cd08dc195) // vk.SIGMA3.y
            mstore(add(_vk, 0x3c0), 0x1222ba4f3d77899972d9d1c7ddf8acfa402ee991a8865800136ec04cd36020c0) // vk.SIGMA4.x
            mstore(add(_vk, 0x3e0), 0x1471a17197465fc19eeaf1c4dd51d9165589bf9ebfe64f2c97f6ed2b7a88c0fd) // vk.SIGMA4.y
            mstore(add(_vk, 0x400), 0x0ddc3b6d8e59cf0996ca71ad4132ca9d618ffd933cf58a8a0953dc76f97cf108) // vk.TABLE1.x
            mstore(add(_vk, 0x420), 0x153193287060386695f4f2d0d3525dec4c6a253f431d3f3fc06aa0e5b0448b8c) // vk.TABLE1.y
            mstore(add(_vk, 0x440), 0x1170f0ece62f8c572bca96b141d27f4bd25585edb9319128045c005d48491b1e) // vk.TABLE2.x
            mstore(add(_vk, 0x460), 0x246cd041690f653f88ed0c56ad282a3dd2e37b8edb1f56b785809d7710bf1c88) // vk.TABLE2.y
            mstore(add(_vk, 0x480), 0x26153c937447356a0c6d6be09d85eb34bc8a00ce9d452888e5fc2b5a7e14fed7) // vk.TABLE3.x
            mstore(add(_vk, 0x4a0), 0x189da022421fbd8dfd7973084d978e555388ad9364679246b07992f84b4e91b2) // vk.TABLE3.y
            mstore(add(_vk, 0x4c0), 0x285311c5e9a4cbb56a3f04f29d5443e8c0f9753e2a5a35acec051fafe2cecce5) // vk.TABLE4.x
            mstore(add(_vk, 0x4e0), 0x2436400260c9d3180beedd0bf49fec92d2d0ac76a1be7f1fad96cbd997175312) // vk.TABLE4.y
            mstore(add(_vk, 0x500), 0x0205dfbe01cade9a4d2feab21cc5e0392040d24d97642f82ac59aa3132127baa) // vk.TABLE_TYPE.x
            mstore(add(_vk, 0x520), 0x0ad1f83535c6dc1d4aa77cbce9c8c71981d5ce9cfe12d7baa06d95b6b257420a) // vk.TABLE_TYPE.y
            mstore(add(_vk, 0x540), 0x10ccd9f2c0e50b5dbdf6f02babffe89454f2879e2a20fdb2e5f987a516df8186) // vk.ID1.x
            mstore(add(_vk, 0x560), 0x10786cc66280a0a980dd545c069cbc4f476fd892d3a273a27f64d4cad83ddce8) // vk.ID1.y
            mstore(add(_vk, 0x580), 0x157de077bcd4a8cd58bf294b9d480ffc5fc2a15cf8e1ecb1266db5b5c5ce2e34) // vk.ID2.x
            mstore(add(_vk, 0x5a0), 0x133a221d916ae88ce0c740b81ef4904d4f8dcfcc828b5f1b0aaa6df04f9c49d3) // vk.ID2.y
            mstore(add(_vk, 0x5c0), 0x1c927befb67bc9470bbf97affbabaa0febc9510852e2ff37b303a7feabefad73) // vk.ID3.x
            mstore(add(_vk, 0x5e0), 0x2e282b9eab6b819f163c59b1cfa8b518f1851d661336c141cb4da65205c1371e) // vk.ID3.y
            mstore(add(_vk, 0x600), 0x1425fe29a42d2764a97ecdd2aab09faccf7d9f9d14be9ea38d58dbe9323f5b5f) // vk.ID4.x
            mstore(add(_vk, 0x620), 0x0f581b2ee0a67bde8cd3130f78ba32ffb67e090aeef81d8b445466f2c60841f7) // vk.ID4.y
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
