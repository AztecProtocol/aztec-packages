// Verification Key Hash: 48e4d8be8860ebe4dfb033c9c425c0c8fde31ecaa5dec6e9c4f1d862cbc643d4
// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.4;

library BlakeUltraVerificationKey {
    function verificationKeyHash() internal pure returns (bytes32) {
        return 0x48e4d8be8860ebe4dfb033c9c425c0c8fde31ecaa5dec6e9c4f1d862cbc643d4;
    }

    function loadVerificationKey(uint256 _vk, uint256 _omegaInverseLoc) internal pure {
        assembly {
            mstore(add(_vk, 0x00), 0x0000000000000000000000000000000000000000000000000000000000008000) // vk.circuit_size
            mstore(add(_vk, 0x20), 0x0000000000000000000000000000000000000000000000000000000000000004) // vk.num_inputs
            mstore(add(_vk, 0x40), 0x2d1ba66f5941dc91017171fa69ec2bd0022a2a2d4115a009a93458fd4e26ecfb) // vk.work_root
            mstore(add(_vk, 0x60), 0x3063edaa444bddc677fcd515f614555a777997e0a9287d1e62bf6dd004d82001) // vk.domain_inverse
            mstore(add(_vk, 0x80), 0x22703f0804e127ca3a084222bea6ea437cfbb6f2bef6581817eeb6be4b83a6bf) // vk.Q1.x
            mstore(add(_vk, 0xa0), 0x2854b842cd7bf05afeb768c5f8e95b7b51fc42334c2e370f94b7e06b0e8a6faa) // vk.Q1.y
            mstore(add(_vk, 0xc0), 0x01b9ab9db48dcf1490197b002f8306f6400058fd707b912117fbf9defafaed38) // vk.Q2.x
            mstore(add(_vk, 0xe0), 0x159c02920661db84558f3ff397de7280e05c4032c338a0317bd6a36a5867d460) // vk.Q2.y
            mstore(add(_vk, 0x100), 0x0c7bcbd9b06018c903394f7be92205dc28fade0e0b01789a26efa2d37068dfea) // vk.Q3.x
            mstore(add(_vk, 0x120), 0x286bb4e38192fdf477cad8748e582982284bf46b17cb9101cfcd65180d8dd384) // vk.Q3.y
            mstore(add(_vk, 0x140), 0x1445e7776943b45e9fade0e56f63665277911d10748b7d5aec6e51730d49b6ed) // vk.Q4.x
            mstore(add(_vk, 0x160), 0x21470dba7fa9b659baf7691e03a896767ea29659154ccf758ff92727412a126c) // vk.Q4.y
            mstore(add(_vk, 0x180), 0x1d8d78c44e9d05815dc4d85c0b9467f6a6b0c8959c1ad41c6aa30aeff9459626) // vk.Q_M.x
            mstore(add(_vk, 0x1a0), 0x22cd2d1ef4401b091c64a3bb10aa81f4c40ae66cdcfee409677f37b9276227e6) // vk.Q_M.y
            mstore(add(_vk, 0x1c0), 0x1a8d3d1c3a2c6382e522560c184f1dd2fc1ff8ec9eafdb8dd04037c3d862e5dd) // vk.Q_C.x
            mstore(add(_vk, 0x1e0), 0x2bc490fc2cbe9fdf87ce2e4404144a938577b4f059c2496c93f51b73fc825292) // vk.Q_C.y
            mstore(add(_vk, 0x200), 0x181f212f403b221c0805d11a8998bbf41ef81409ee3a019ae7775f39d692cee2) // vk.Q_ARITHMETIC.x
            mstore(add(_vk, 0x220), 0x18bb52801779b80fbdb803cbb416bdfb20a286f62e43006c5f4bb430c0e0bbc2) // vk.Q_ARITHMETIC.y
            mstore(add(_vk, 0x240), 0x00a76d339bdc6e030de531fc51322f06e35e0db2c71d02705cbc87497c1dcc86) // vk.QSORT.x
            mstore(add(_vk, 0x260), 0x12435124c05dc87a5aa6a57b7c213c0a3653f8cfe92a568a50d1e580ae73936d) // vk.QSORT.y
            mstore(add(_vk, 0x280), 0x2e76c4474fcb457db84fb273ccc10a4647a1a37444369f2f275bb74540f5e2d0) // vk.Q_ELLIPTIC.x
            mstore(add(_vk, 0x2a0), 0x209035caddd02a78acd0ed617a85d782533bd142c6cad8e3338f3142b919c3a4) // vk.Q_ELLIPTIC.y
            mstore(add(_vk, 0x2c0), 0x254c7c79f29e6f05184889d52a7c01375832d53ea8dd60b93162a5805d715657) // vk.Q_AUX.x
            mstore(add(_vk, 0x2e0), 0x23558713233600d8847c983db3c2771210aad83fc39e33f4821c4b483fe579c1) // vk.Q_AUX.y
            mstore(add(_vk, 0x300), 0x1b1751d2a40ad3926fc75524b92f198668630bcc50f9d9bca991b5a46400f301) // vk.SIGMA1.x
            mstore(add(_vk, 0x320), 0x011ab25916819ad44ab3b3a735ecc9f0bf837e600467017a3cb12c40842b57ef) // vk.SIGMA1.y
            mstore(add(_vk, 0x340), 0x1a0d27d21e4c23edee9346716d3f495951d1741f43da4871bd2674dfde8178bd) // vk.SIGMA2.x
            mstore(add(_vk, 0x360), 0x1dee5edf353bbeebde3c56137bf81e4bdccf1ae09c842a0ed85f17fd709daf53) // vk.SIGMA2.y
            mstore(add(_vk, 0x380), 0x2be8b6566855f9d4b42835780532cb76621459237d20536e0eb3bf76dadcd2c3) // vk.SIGMA3.x
            mstore(add(_vk, 0x3a0), 0x0188ecfe49edb152eff1ac0e4ce3747797a6cc2ec33ec7f253c563adda84a824) // vk.SIGMA3.y
            mstore(add(_vk, 0x3c0), 0x0dde6de09527d57a1b0d10f8390d3bc64db03719756733354638dd261ba22b16) // vk.SIGMA4.x
            mstore(add(_vk, 0x3e0), 0x159c9f851883d75654853022db92c0df214854759c6e19f03f6fd5f6869b8d18) // vk.SIGMA4.y
            mstore(add(_vk, 0x400), 0x2c9323a1f1a4497d7a2da4e7f051ae2bd3e79fa5129b9e839ed92e2724fa4dd4) // vk.TABLE1.x
            mstore(add(_vk, 0x420), 0x1da5adafa0b2e605fae3a5b5f38f5320452c443e0cdbb9146847b621c6582595) // vk.TABLE1.y
            mstore(add(_vk, 0x440), 0x049ad18a8303ae13fc27eb803bd1e4ab0843d7ea0c8da3e9de4069d7d124c35d) // vk.TABLE2.x
            mstore(add(_vk, 0x460), 0x208d3a7f02e894bea3809a5a03f4d93fc4ffd3012ba21d785ebf6e29c79f84eb) // vk.TABLE2.y
            mstore(add(_vk, 0x480), 0x008d6cbc3467442b0c8cfecb879705164b1a375d5b692c1a19968ad14ced51f1) // vk.TABLE3.x
            mstore(add(_vk, 0x4a0), 0x01a4630460cf19d3744f57323ed8e95c711b1f35dc4be35136105afb64bca1be) // vk.TABLE3.y
            mstore(add(_vk, 0x4c0), 0x2a32902c477f3c4e5d636886d58e6e92787d6835719aff2124de11661a931e5f) // vk.TABLE4.x
            mstore(add(_vk, 0x4e0), 0x02bd52e022a279775cc203ef117ff464ce803b128e12d7d9e4906527ccc0d179) // vk.TABLE4.y
            mstore(add(_vk, 0x500), 0x002158853758e7f671a63197c33f09025895ec819f33a69942ce3ad3874792c5) // vk.TABLE_TYPE.x
            mstore(add(_vk, 0x520), 0x2c56d9309c085c8e74d2252c50dff9c735589e431073c699d16663c010c27f12) // vk.TABLE_TYPE.y
            mstore(add(_vk, 0x540), 0x18f0be507e453236eecc41e29ba9e575027f2a22dc508ce0be79701ab0760328) // vk.ID1.x
            mstore(add(_vk, 0x560), 0x2cc55fb77d81238a9659604ecbf38c322c3e93a25716b44e08877583c99eb52f) // vk.ID1.y
            mstore(add(_vk, 0x580), 0x02fe9855b35527cf14bfeaba70ee83ff36db3ef35a549677ceb95076cf95f0b4) // vk.ID2.x
            mstore(add(_vk, 0x5a0), 0x2987a64728505b1ec90f04ecf38b0f3bf18dbd50d379c686fe35ac2005932343) // vk.ID2.y
            mstore(add(_vk, 0x5c0), 0x0559edf459c36c8579d3448de7897258db197c8e3e69e8d9cdc5ee13adeb1b06) // vk.ID3.x
            mstore(add(_vk, 0x5e0), 0x27ee1775cd9f7a365f2f5d76aa37dd4f197ee8a90a846efddd84f0a255ddebed) // vk.ID3.y
            mstore(add(_vk, 0x600), 0x0fa8737adffd19981969fe6891f2cf783a63277dd469a8f64805510c78f1ebbb) // vk.ID4.x
            mstore(add(_vk, 0x620), 0x1d02caa8a2bc3aa1e96a61fcbe75298b9e365402cff9188cf942c3393331e1a8) // vk.ID4.y
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
