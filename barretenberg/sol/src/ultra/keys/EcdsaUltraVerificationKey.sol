// Verification Key Hash: 04925e4f94fd295a931d988e6fd9ef882b3dbd4df75d762be3183c66bfefa055
// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.4;

library EcdsaUltraVerificationKey {
    function verificationKeyHash() internal pure returns (bytes32) {
        return 0x04925e4f94fd295a931d988e6fd9ef882b3dbd4df75d762be3183c66bfefa055;
    }

    function loadVerificationKey(uint256 _vk, uint256 _omegaInverseLoc) internal pure {
        assembly {
            mstore(add(_vk, 0x00), 0x0000000000000000000000000000000000000000000000000000000000010000) // vk.circuit_size
            mstore(add(_vk, 0x20), 0x0000000000000000000000000000000000000000000000000000000000000006) // vk.num_inputs
            mstore(add(_vk, 0x40), 0x00eeb2cb5981ed45649abebde081dcff16c8601de4347e7dd1628ba2daac43b7) // vk.work_root
            mstore(add(_vk, 0x60), 0x30641e0e92bebef818268d663bcad6dbcfd6c0149170f6d7d350b1b1fa6c1001) // vk.domain_inverse
            mstore(add(_vk, 0x80), 0x0d03a55e1c08f638bec6b3b6726ec4e8b4a2445fb898001c5cc59d90747265e1) // vk.Q1.x
            mstore(add(_vk, 0xa0), 0x28f5aaa22aae66726d58d5e1dd57733badd7577f842cafbef590b563688d3057) // vk.Q1.y
            mstore(add(_vk, 0xc0), 0x28e3095ae72fd2889ead6c3a95cf8592392c1d3546222ff15638ba280c161f31) // vk.Q2.x
            mstore(add(_vk, 0xe0), 0x27cda145ab9d0a13dae8bcab74ad6901f656c76ba1605d068a005dc4efd14ea9) // vk.Q2.y
            mstore(add(_vk, 0x100), 0x29e0d8172946a5fdd2998f57cf3814ee55393d265a7f0bd4765687fe0aa72181) // vk.Q3.x
            mstore(add(_vk, 0x120), 0x21d649dcdd6a1182f4ba7b2a42e26992774cb9743d6520defe56c582d6b8d7f0) // vk.Q3.y
            mstore(add(_vk, 0x140), 0x2839198a3ce970ca0a0fafe33d2ca8ffe50d70be7e613eb710c08ca95115998e) // vk.Q4.x
            mstore(add(_vk, 0x160), 0x0da0e1c3eb107528a589868e34ae65114de290ddd45ff23fc5f637c0da23c1a2) // vk.Q4.y
            mstore(add(_vk, 0x180), 0x303ab526aeb8130ef858a97def955fd10c9b528ab3667415b8bfe279e507186d) // vk.Q_M.x
            mstore(add(_vk, 0x1a0), 0x1db1e82067093af3ba5cd78460f538b9d84c45bca6b3f6731d1072def1f031b6) // vk.Q_M.y
            mstore(add(_vk, 0x1c0), 0x24cc5a478a5ffd79cba3cbb6d2db878fc339abe56a63440384afb38ee0e95731) // vk.Q_C.x
            mstore(add(_vk, 0x1e0), 0x1e540a5249a2d3e326b0c9be362173e6a734afa900bac9859310ca018328e66a) // vk.Q_C.y
            mstore(add(_vk, 0x200), 0x13db96945a09894dddfa79d2b9f9e9e1eb6204065f662a17d7dbf6d257590d33) // vk.Q_ARITHMETIC.x
            mstore(add(_vk, 0x220), 0x00d9af8f917935b1836f17dcdf1d44a1fa4e3655777f8ddca39905b38b80ab48) // vk.Q_ARITHMETIC.y
            mstore(add(_vk, 0x240), 0x1a66842ed11152b8ccd1ffe548414be7dadbb956ae828c47cb32c449fb9a2a21) // vk.QSORT.x
            mstore(add(_vk, 0x260), 0x0b4304dfa9379f11f9387befd9522dde481e04d359a511e543b9c9fcfd4c8e70) // vk.QSORT.y
            mstore(add(_vk, 0x280), 0x2f213c7a4c064a63d6a07366df0ea85aef9ad2125a188c3e656f95471e416a0a) // vk.Q_ELLIPTIC.x
            mstore(add(_vk, 0x2a0), 0x067a270bed55e72ffb3cfa39af3e5b8bcb4961d72bb301978af13c4ddc73e5df) // vk.Q_ELLIPTIC.y
            mstore(add(_vk, 0x2c0), 0x27b10524a99f00d9c59cc15ff3b7dfc34975b6f18e06b9c6c3a6136bf3b56f32) // vk.Q_AUX.x
            mstore(add(_vk, 0x2e0), 0x071a9bf80d112c32482178ff02f855436cf6fb4b4376ef7e2f03381c2e6da379) // vk.Q_AUX.y
            mstore(add(_vk, 0x300), 0x11f8a90324450819709f17508ffaf140d17a949487af44e2f169c7371343411b) // vk.SIGMA1.x
            mstore(add(_vk, 0x320), 0x18db987ab3b02b830aace8661d0012170892e6b8f234d844f981e0c5b3e6e7c0) // vk.SIGMA1.y
            mstore(add(_vk, 0x340), 0x2df70bc7a4644eea4a21ff8e974eb3d624e311bc148b316fe25cd9486e9540ed) // vk.SIGMA2.x
            mstore(add(_vk, 0x360), 0x23e182a4495ff2abe1295260edaa7f3a205d8e4de69f783c7c66c0ba9859917b) // vk.SIGMA2.y
            mstore(add(_vk, 0x380), 0x10e03c5fc02493f4b37a58bfee7c6fa50bb3977477279a3f7623668e35305f75) // vk.SIGMA3.x
            mstore(add(_vk, 0x3a0), 0x2b2bc0c7955e6b99f93a62e2e1955a76d4bff3795985e9e70d64497052a93024) // vk.SIGMA3.y
            mstore(add(_vk, 0x3c0), 0x0c68404f1fb46097dfc1deabcaece7a47112489fd3cba333fd4ba985a4291b2d) // vk.SIGMA4.x
            mstore(add(_vk, 0x3e0), 0x186dd99ca6e71d8e125f30ea6c9d4093cc7bb4149fc9c50490618a0fc92ee7a3) // vk.SIGMA4.y
            mstore(add(_vk, 0x400), 0x1a55dc1a642e0833b27de2085de8a8bf1e54f3409fdf6d955eec6bf73ba3c93e) // vk.TABLE1.x
            mstore(add(_vk, 0x420), 0x2bdf5828e5a0e064d777710204eec800295f987905043ac054acbc038ba0d0dd) // vk.TABLE1.y
            mstore(add(_vk, 0x440), 0x03a621c8d74670ed1b06ddb06644a04b11e4d77148be631c5a1daba27625ec83) // vk.TABLE2.x
            mstore(add(_vk, 0x460), 0x2b9287b3d040871b3f97a6b1f33024317ac9f86adfe80f75f27296b36bd333c4) // vk.TABLE2.y
            mstore(add(_vk, 0x480), 0x1c233efa3cbfff821f0fe636f12451241dbee781de362da405cd2b08e06ac820) // vk.TABLE3.x
            mstore(add(_vk, 0x4a0), 0x238cdd74317e34461f06d04474eaa3b08fbeaf42bebad8402b51f00c892df46f) // vk.TABLE3.y
            mstore(add(_vk, 0x4c0), 0x08aa2e3e45c14179616cc69685e1bd257ce49503b425e0bdbf4010c7be859fbc) // vk.TABLE4.x
            mstore(add(_vk, 0x4e0), 0x2fd83c0e339172d2315a24dfd4aad276e5e860f3849b111b62723febdb3ee286) // vk.TABLE4.y
            mstore(add(_vk, 0x500), 0x171e700abccc3b9764a2d27e09b3208941a0b8ac7299c2580e6b24d56b6139a7) // vk.TABLE_TYPE.x
            mstore(add(_vk, 0x520), 0x151a058305194c4e68972296ddda0fd23359c1aaeb864bf8e273bbd6405b9718) // vk.TABLE_TYPE.y
            mstore(add(_vk, 0x540), 0x0b6d6d86b0a3e81f2f146f798e63d0ee99e4594fbd0a826910461ccae434bfd3) // vk.ID1.x
            mstore(add(_vk, 0x560), 0x0f4bc8f33eb6afed895ab21c4c5c80c741b7565607280ec2fe4c4f2e70ea6e6e) // vk.ID1.y
            mstore(add(_vk, 0x580), 0x03c52afd7bf4066c19ef0b9c4bbd5cd3edbeebcd8cfb9de47b3199c4888fdc31) // vk.ID2.x
            mstore(add(_vk, 0x5a0), 0x20923fb0fd3790a6e995640b803825c0dec8bc7da64203e55c69b26efee636bd) // vk.ID2.y
            mstore(add(_vk, 0x5c0), 0x2cbc9f464c22cdc38a834fdb3810d0e8d4d927dbcf55cdfee347895e838f5e03) // vk.ID3.x
            mstore(add(_vk, 0x5e0), 0x23e178dd197bd1ea0db8b76d597fb7bc5a7ae675b1496b7ccaff0722489795c4) // vk.ID3.y
            mstore(add(_vk, 0x600), 0x124c5ef3a8d659717f89077b3f814fe4a575ad77acce9953af915a64569e94a5) // vk.ID4.x
            mstore(add(_vk, 0x620), 0x04733238e5caa04c7cd0d154988171f8ac3e492ef48ada642007220a4fdc4703) // vk.ID4.y
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
