// Verification Key Hash: 759b981a450fcab830fc1dd89825d4914fd6062a100e68774f091d1b8b1f5a03
// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.4;

library EcdsaUltraVerificationKey {
    function verificationKeyHash() internal pure returns (bytes32) {
        return 0x759b981a450fcab830fc1dd89825d4914fd6062a100e68774f091d1b8b1f5a03;
    }

    function loadVerificationKey(uint256 _vk, uint256 _omegaInverseLoc) internal pure {
        assembly {
            mstore(add(_vk, 0x00), 0x0000000000000000000000000000000000000000000000000000000000010000) // vk.circuit_size
            mstore(add(_vk, 0x20), 0x0000000000000000000000000000000000000000000000000000000000000006) // vk.num_inputs
            mstore(add(_vk, 0x40), 0x00eeb2cb5981ed45649abebde081dcff16c8601de4347e7dd1628ba2daac43b7) // vk.work_root
            mstore(add(_vk, 0x60), 0x30641e0e92bebef818268d663bcad6dbcfd6c0149170f6d7d350b1b1fa6c1001) // vk.domain_inverse
            mstore(add(_vk, 0x80), 0x177d2fc406491de711b4d134f628b88794a5ddcf7f35cdaa3d40880cd70f9cb1) // vk.Q1.x
            mstore(add(_vk, 0xa0), 0x286f7ee67558c8ce754860495860b6d7f1bdb55baed6336bfdcc74dc241472ea) // vk.Q1.y
            mstore(add(_vk, 0xc0), 0x10e238745741c57f4360a9a9789e16b487a41dd7320cb32cb02d9b200a1e447a) // vk.Q2.x
            mstore(add(_vk, 0xe0), 0x172c5e285a66b6b5d1f071e40a5d17ec2936e0a217a6ac2998481bdb0ecc1e90) // vk.Q2.y
            mstore(add(_vk, 0x100), 0x05d431b0ae6ad5bfb119a92bc3568df0fb32d1203110077914641e519d14099d) // vk.Q3.x
            mstore(add(_vk, 0x120), 0x1d21c8e1240c6f5e02c749cf1265d1472f35162f71bc0231bf460bcfbe0259b1) // vk.Q3.y
            mstore(add(_vk, 0x140), 0x19fe9373be05a55cfdcf6a651d61fe4cc4868b9c3d9a2ccc625662026ad82057) // vk.Q4.x
            mstore(add(_vk, 0x160), 0x2c704dcb77b5a086a363a58def3eb5d3d8bb17c42f6242121e841add44e718e1) // vk.Q4.y
            mstore(add(_vk, 0x180), 0x21dbb91e680abf1735bb699b976b6386656d061d710b868d76328fec89d0a59d) // vk.Q_M.x
            mstore(add(_vk, 0x1a0), 0x0975b5b41ee566ef2cfcfce64666da4481ddacff0d3538b762d06fbf769ed3c9) // vk.Q_M.y
            mstore(add(_vk, 0x1c0), 0x014b922dd112f0fb1721f4e8763feb5bb1e1e2173f1540f029b1b9256dd8219f) // vk.Q_C.x
            mstore(add(_vk, 0x1e0), 0x005b05dbe091b3f8b318df5810965e8613a5ce84a23baf99cfcfb760b73dfdab) // vk.Q_C.y
            mstore(add(_vk, 0x200), 0x008073ec28cb32d392e4cf5ca5c8882d0a172c5f727b2b967327bc737229210f) // vk.Q_ARITHMETIC.x
            mstore(add(_vk, 0x220), 0x10b5841ce6323158a6491e29ac2afe2b20b4b3ed1dd46e3fb7ad7b7a285c3cf0) // vk.Q_ARITHMETIC.y
            mstore(add(_vk, 0x240), 0x0069c485cdd6538403b7f723e554d2d615321994f5f7f82a3d9c79e368735891) // vk.QSORT.x
            mstore(add(_vk, 0x260), 0x113726a166d7cd61f29fda4025cb822b25fcb2d26517d96d69dda23ef9081145) // vk.QSORT.y
            mstore(add(_vk, 0x280), 0x21245d6c0a4d2ff12b21a825f39f30e8f8cf9b259448d111183e975828539576) // vk.Q_ELLIPTIC.x
            mstore(add(_vk, 0x2a0), 0x16a409532c8a1693536e93b6ce9920bfc2e6796e8dfe404675a0cdf6ee77ee7a) // vk.Q_ELLIPTIC.y
            mstore(add(_vk, 0x2c0), 0x0bf328435a5f6d1c74ee907358968420b293076d86317517871294f3d4182b2b) // vk.Q_AUX.x
            mstore(add(_vk, 0x2e0), 0x02fb32c5c5c1801f4a41540e9c40f82c0e520658713e22c0f8098a903a8ebb13) // vk.Q_AUX.y
            mstore(add(_vk, 0x300), 0x0b23bda3b72297f230273f478e411f40332db18c37a1b3961a4dda35404a9976) // vk.SIGMA1.x
            mstore(add(_vk, 0x320), 0x2843e3fa6175d14ebf09cc6de5775bf27eed32a40e985469e9ae5fe92fd3b714) // vk.SIGMA1.y
            mstore(add(_vk, 0x340), 0x2c1ef692ccb668a451ad0a3b2bcf58a053e830df8f718d5baaea944abd03bb40) // vk.SIGMA2.x
            mstore(add(_vk, 0x360), 0x10f9e6850de170838e27cf3eb288c01f15293386bde26c2bdcce63a68d2f161d) // vk.SIGMA2.y
            mstore(add(_vk, 0x380), 0x14a3df5a4348da1b3b145d1b90540ac94cf164d5c03c031cbc07b84b0e7f7b97) // vk.SIGMA3.x
            mstore(add(_vk, 0x3a0), 0x1e3248f0598fc16de1cedf4a96459a6bfbe4d829a7c05b1ba87eedbe2878044d) // vk.SIGMA3.y
            mstore(add(_vk, 0x3c0), 0x12573d129c38e8b50998b538ae277a865789512c6fb8d8a1a0697e1997532382) // vk.SIGMA4.x
            mstore(add(_vk, 0x3e0), 0x12db2a48d0ea21c0368a46f96dcda55dbc88cc378cb71634990b3e2b0e65e5ea) // vk.SIGMA4.y
            mstore(add(_vk, 0x400), 0x18f7cf965339d9c9d190296fa92f915767b0a8da455975f3e03fa98439fd7110) // vk.TABLE1.x
            mstore(add(_vk, 0x420), 0x0eecc02f9d44125407adbf00d56b086afd1adc5de536450afe05de382761b32f) // vk.TABLE1.y
            mstore(add(_vk, 0x440), 0x0bdfe662ea9f40f125ca5f7e99a8c6ba09b87ba8313864316745df862946c5c4) // vk.TABLE2.x
            mstore(add(_vk, 0x460), 0x0c5313c5b17634332920f54081fd46464a5ce9399e507c8fece9df28bff19033) // vk.TABLE2.y
            mstore(add(_vk, 0x480), 0x232ab86409f60c50fd5f04e879fbcbe60e358eb0337c5d0db1934277e1d8b1f2) // vk.TABLE3.x
            mstore(add(_vk, 0x4a0), 0x1fda66dfb58273345f2471dff55c51b6856241460272e64b4cc67cde65231e89) // vk.TABLE3.y
            mstore(add(_vk, 0x4c0), 0x024ccc0fcff3b515cdc97dde2fae5c516bf3c97207891801707142af02538a83) // vk.TABLE4.x
            mstore(add(_vk, 0x4e0), 0x27827250d02b7b67d084bfc52b26c722f33f75ae5098c109573bfe92b782e559) // vk.TABLE4.y
            mstore(add(_vk, 0x500), 0x1c45b884f74b3d6adceb82af8149dcf5ac847fcaa3256142ba1222bb276a6488) // vk.TABLE_TYPE.x
            mstore(add(_vk, 0x520), 0x3030d7782dd8035df1cdd1695ab4f24bc640c6876f2a897b7ce1d38b87f915e4) // vk.TABLE_TYPE.y
            mstore(add(_vk, 0x540), 0x1294d1c8fbad4145efa8fe3f89fd24e3ec7dd804c43e7f9d7286fcce1cf7548b) // vk.ID1.x
            mstore(add(_vk, 0x560), 0x21a7df2d89d67c518baf85172b66262c08ecbedffcb25068eddb008d0cd98ef5) // vk.ID1.y
            mstore(add(_vk, 0x580), 0x23135e9861098e8461a5f7806010b3be05a036170c46263523662aa63627a29b) // vk.ID2.x
            mstore(add(_vk, 0x5a0), 0x07c89554a38afdcb1cce29fae89196f4477e042391dc041d8ef8e5c697d168a8) // vk.ID2.y
            mstore(add(_vk, 0x5c0), 0x2d560c5d2e6c81d3d4d3ebde80199ef18a77109b8a391a304e2dbb93be6cc23a) // vk.ID3.x
            mstore(add(_vk, 0x5e0), 0x12543ff3bb258e27218c4db97783388213fbbe3f8dbcb29fcfa8b1900db5a105) // vk.ID3.y
            mstore(add(_vk, 0x600), 0x071d9ed32b14145972cf27179c6c99f48378977d0b458f6cab549555b9d7c6c9) // vk.ID4.x
            mstore(add(_vk, 0x620), 0x1951794e5e38ff2a0f7269aee43199562d64177588177fbac541e195b1cecd83) // vk.ID4.y
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
