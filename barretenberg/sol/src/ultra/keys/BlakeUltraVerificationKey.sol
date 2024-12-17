// Verification Key Hash: b632c420983f1811242cb44c30f8e6fb663c25f78a353865ed68f6e89d929ad7
// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.4;

library BlakeUltraVerificationKey {
    function verificationKeyHash() internal pure returns (bytes32) {
        return 0xb632c420983f1811242cb44c30f8e6fb663c25f78a353865ed68f6e89d929ad7;
    }

    function loadVerificationKey(uint256 _vk, uint256 _omegaInverseLoc) internal pure {
        assembly {
            mstore(add(_vk, 0x00), 0x0000000000000000000000000000000000000000000000000000000000008000) // vk.circuit_size
            mstore(add(_vk, 0x20), 0x0000000000000000000000000000000000000000000000000000000000000004) // vk.num_inputs
            mstore(add(_vk, 0x40), 0x2d1ba66f5941dc91017171fa69ec2bd0022a2a2d4115a009a93458fd4e26ecfb) // vk.work_root
            mstore(add(_vk, 0x60), 0x3063edaa444bddc677fcd515f614555a777997e0a9287d1e62bf6dd004d82001) // vk.domain_inverse
            mstore(add(_vk, 0x80), 0x22703f0804e127ca3a084222bea6ea437cfbb6f2bef6581817eeb6be4b83a6bf) // vk.Q1.x
            mstore(add(_vk, 0xa0), 0x2854b842cd7bf05afeb768c5f8e95b7b51fc42334c2e370f94b7e06b0e8a6faa) // vk.Q1.y
            mstore(add(_vk, 0xc0), 0x1632a45613f6dd7155fe6056d33bcc96bb62840af313a1af5d0790c25fd64de0) // vk.Q2.x
            mstore(add(_vk, 0xe0), 0x09f2d38f64d24454fb39f47f44d17bd2b6d8a261fc7a8d3eea7148e420431db2) // vk.Q2.y
            mstore(add(_vk, 0x100), 0x04a64347e55659ca18291c2340c55969817a0ab48511bba8c49393dc242e4057) // vk.Q3.x
            mstore(add(_vk, 0x120), 0x175f4cd4cc9846d4bc902a4a44e156e1731c8899bcb64fece3c69f1ed5b3732f) // vk.Q3.y
            mstore(add(_vk, 0x140), 0x1445e7776943b45e9fade0e56f63665277911d10748b7d5aec6e51730d49b6ed) // vk.Q4.x
            mstore(add(_vk, 0x160), 0x21470dba7fa9b659baf7691e03a896767ea29659154ccf758ff92727412a126c) // vk.Q4.y
            mstore(add(_vk, 0x180), 0x2d3306f68ef5e9f6d9867117a2eba1c5bcb15692edc5481b53dfe752e421dc0c) // vk.Q_M.x
            mstore(add(_vk, 0x1a0), 0x00a9d1b18ef9ef8e14063047fcdca03baf0c09c2ab292ec2fe8f6d56300958c6) // vk.Q_M.y
            mstore(add(_vk, 0x1c0), 0x0ec6a488608586384ffc6ee074116ba87bb32bfca3dd6db592c559bc8369a0ec) // vk.Q_C.x
            mstore(add(_vk, 0x1e0), 0x2fc3d28b016ff05ef3251dee6df4ddbf2b98bff9b498c05cbae7501f21fa3528) // vk.Q_C.y
            mstore(add(_vk, 0x200), 0x181f212f403b221c0805d11a8998bbf41ef81409ee3a019ae7775f39d692cee2) // vk.Q_ARITHMETIC.x
            mstore(add(_vk, 0x220), 0x18bb52801779b80fbdb803cbb416bdfb20a286f62e43006c5f4bb430c0e0bbc2) // vk.Q_ARITHMETIC.y
            mstore(add(_vk, 0x240), 0x00a76d339bdc6e030de531fc51322f06e35e0db2c71d02705cbc87497c1dcc86) // vk.QSORT.x
            mstore(add(_vk, 0x260), 0x12435124c05dc87a5aa6a57b7c213c0a3653f8cfe92a568a50d1e580ae73936d) // vk.QSORT.y
            mstore(add(_vk, 0x280), 0x2e76c4474fcb457db84fb273ccc10a4647a1a37444369f2f275bb74540f5e2d0) // vk.Q_ELLIPTIC.x
            mstore(add(_vk, 0x2a0), 0x209035caddd02a78acd0ed617a85d782533bd142c6cad8e3338f3142b919c3a4) // vk.Q_ELLIPTIC.y
            mstore(add(_vk, 0x2c0), 0x254c7c79f29e6f05184889d52a7c01375832d53ea8dd60b93162a5805d715657) // vk.Q_AUX.x
            mstore(add(_vk, 0x2e0), 0x23558713233600d8847c983db3c2771210aad83fc39e33f4821c4b483fe579c1) // vk.Q_AUX.y
            mstore(add(_vk, 0x300), 0x28614b03e80d285e00deac31455ad2859a33627f4c150583f48a35cc890d1f8f) // vk.SIGMA1.x
            mstore(add(_vk, 0x320), 0x1864deb43e02b113184078e981dd524a4bac2267b46898d3204d074db7854879) // vk.SIGMA1.y
            mstore(add(_vk, 0x340), 0x1cb221e63e0cce3882bcc1bcf59378a8761dcf9c60dddbfb9916462b0c472fbc) // vk.SIGMA2.x
            mstore(add(_vk, 0x360), 0x0b6468629d32faf01306b8c70cb9658540afe95cacb2b74e7c7e6ff02de6aedd) // vk.SIGMA2.y
            mstore(add(_vk, 0x380), 0x035ba693d1e275dfc9508002e255623c03824f3da3b7d167889c4bed952f6d8f) // vk.SIGMA3.x
            mstore(add(_vk, 0x3a0), 0x10371645f3f56ad1d3aa29f3bd8ecd9c57132e898f731d65558430cea98aa12b) // vk.SIGMA3.y
            mstore(add(_vk, 0x3c0), 0x00edfa2e2de551d0b473d6171756f3ea741cad84eb1492fb7a185d70dd0a7221) // vk.SIGMA4.x
            mstore(add(_vk, 0x3e0), 0x2a41f9db2b8bc905df6a26e1f47f6d4b14a9739ab3d0fa35be5953af70c633b3) // vk.SIGMA4.y
            mstore(add(_vk, 0x400), 0x06c5d3c2a64587cf9dc278c6892854fc8f1aba4183115224cb2eda4c1aab64b8) // vk.TABLE1.x
            mstore(add(_vk, 0x420), 0x132622df9222e04fa9c4cf2895212a49556038d4fdc6d0d7a15b1067bb446efa) // vk.TABLE1.y
            mstore(add(_vk, 0x440), 0x2dbc1ac72b2f0c530b3bdbef307395e6059f82ce9f3beea34ff6c3a04ca112bc) // vk.TABLE2.x
            mstore(add(_vk, 0x460), 0x23e9676a2c36926b3e10b1102f06aa3a9828d1422ae9e6ea77203025cd18ada0) // vk.TABLE2.y
            mstore(add(_vk, 0x480), 0x298b6eb4baf5c75d4542a2089226886cc3ef984af332cae76356af6da70820fe) // vk.TABLE3.x
            mstore(add(_vk, 0x4a0), 0x1bb16a4d3b60d47e572e02fac8bf861df5ba5f96942054e0896c7d4d602dc5c7) // vk.TABLE3.y
            mstore(add(_vk, 0x4c0), 0x1f5976fc145f0524228ca90c221a21228ff9be92d487b56890a39c3bc0d22bf2) // vk.TABLE4.x
            mstore(add(_vk, 0x4e0), 0x0f43d83a0d9eb36476e05c8d1280df98ec46ce93ae238597a687a4937ebec6cc) // vk.TABLE4.y
            mstore(add(_vk, 0x500), 0x24ff9219ef37bf7b09f7159eecd91a04575de2f08ed1a4e5f12de29f88c09ca6) // vk.TABLE_TYPE.x
            mstore(add(_vk, 0x520), 0x1c106354cc55938c81bb295784363c019517952fb7f4a6faaeca2910a687162b) // vk.TABLE_TYPE.y
            mstore(add(_vk, 0x540), 0x266915a4cb91120dc75382cd9b3af13c67ce63227f7d6ea4ad04d903fb2434c5) // vk.ID1.x
            mstore(add(_vk, 0x560), 0x053b66a3b7f8ea2ae35e2f4cf2ac23b9b6c434f9d9617628a334e5c18f11b8dd) // vk.ID1.y
            mstore(add(_vk, 0x580), 0x0b07f09aee58678c763bb446191e58bd072ed87bb5bcdd6da0f76546b40a85fc) // vk.ID2.x
            mstore(add(_vk, 0x5a0), 0x08e5120d71bedb26ebcd213d34d8c5875d27c10b52cc953b352cfe1a335e76e2) // vk.ID2.y
            mstore(add(_vk, 0x5c0), 0x2f596b35c5f6b84a87aaa9c55b8024eb568c6b781684354dc01dfc8fc796ddde) // vk.ID3.x
            mstore(add(_vk, 0x5e0), 0x1cf6cc14989803314cac6a750a7abfa08a866a849c2c93ecaffdf17a39c7018a) // vk.ID3.y
            mstore(add(_vk, 0x600), 0x1e2b1d906c54b8522800ce716458f499958b648b5c7272a1af0acf52eb2551a4) // vk.ID4.x
            mstore(add(_vk, 0x620), 0x268cb932de375fcdf382490bbbe55519e68d78c23a426673f7c56e8ea97fd6a3) // vk.ID4.y
            mstore(add(_vk, 0x640), 0x00) // vk.contains_pairing_point_accumulator
            mstore(add(_vk, 0x660), 0) // vk.pairing_point_accumulator_public_input_indices
            mstore(add(_vk, 0x680), 0x260e01b251f6f1c7e7ff4e580791dee8ea51d87a358e038b4efe30fac09383c1) // vk.g2_x.X.c1
            mstore(add(_vk, 0x6a0), 0x0118c4d5b837bcc2bc89b5b398b5974e9f5944073b32078b7e231fec938883b0) // vk.g2_x.X.c0
            mstore(add(_vk, 0x6c0), 0x04fc6369f7110fe3d25156c1bb9a72859cf2a04641f99ba4ee413c80da6a5fe4) // vk.g2_x.Y.c1
            mstore(add(_vk, 0x6e0), 0x22febda3c0c0632a56475b4214e5615e11e6dd3f96e6cea2854a87d4dacc5e55) // vk.g2_x.Y.c0
            mstore(_omegaInverseLoc, 0x05d33766e4590b3722701b6f2fa43d0dc3f028424d384e68c92a742fb2dbc0b4) // vk.work_root_inverse
        }
    }
}
