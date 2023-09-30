// Verification Key Hash: d90f2c2749f4fdd455b5de629173d4e988ef1014f55791c46685d7c20c2dce4d
// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.4;

library Add2UltraVerificationKey {
    function verificationKeyHash() internal pure returns(bytes32) {
        return 0xd90f2c2749f4fdd455b5de629173d4e988ef1014f55791c46685d7c20c2dce4d;
    }

    function loadVerificationKey(uint256 _vk, uint256 _omegaInverseLoc) internal pure {
        assembly {
            mstore(add(_vk, 0x00), 0x0000000000000000000000000000000000000000000000000000000000008000) // vk.circuit_size
            mstore(add(_vk, 0x20), 0x0000000000000000000000000000000000000000000000000000000000000003) // vk.num_inputs
            mstore(add(_vk, 0x40), 0x2d1ba66f5941dc91017171fa69ec2bd0022a2a2d4115a009a93458fd4e26ecfb) // vk.work_root
            mstore(add(_vk, 0x60), 0x3063edaa444bddc677fcd515f614555a777997e0a9287d1e62bf6dd004d82001) // vk.domain_inverse
            mstore(add(_vk, 0x80), 0x19964a2aa3b4b8e20d7a9d5ba1b29f5f00a1bdaed5cb382214f985d511cde966) // vk.Q1.x
            mstore(add(_vk, 0xa0), 0x07b3eb155199738946625f996c8644a1b886b165034efc37ed491f953a575c95) // vk.Q1.y
            mstore(add(_vk, 0xc0), 0x1e659c2178430c0b5ca7e15312612877aab3afcb8aef7a31fa45a88448ac4e36) // vk.Q2.x
            mstore(add(_vk, 0xe0), 0x09187841f0ecfd2c93050a6c77e52e70e4f434359af7707567efe1a0e3c294bd) // vk.Q2.y
            mstore(add(_vk, 0x100), 0x2c6da8b9ae520e7bfca581567fb4047063c4216551d9c5e19c2fb9601257158b) // vk.Q3.x
            mstore(add(_vk, 0x120), 0x08ed376ef123ee394fc1ec3a1398504c6863622a409e1852a0c74ec3848dd6a4) // vk.Q3.y
            mstore(add(_vk, 0x140), 0x22149a3f2b0c6c3aa79cccd27d5e1478caa30a3284fcff5b608166376f7ead19) // vk.Q4.x
            mstore(add(_vk, 0x160), 0x2cf4413c9a82c95b86dc43a3adb8fc13f4a5c89c57cbfd8cb6d9d1ec644427fa) // vk.Q4.y
            mstore(add(_vk, 0x180), 0x1c8c2d38482dbc8ac03b6779351aa8b8090eb94a7246fb762f090288e345259f) // vk.Q_M.x
            mstore(add(_vk, 0x1a0), 0x26a5b4e66d65adcd4d32772f1fd72c80e138246d937b6b469a7a581ef7332143) // vk.Q_M.y
            mstore(add(_vk, 0x1c0), 0x298412b13e530cdd803334a61cea7bd02bf2c49bcfaf6bf4fd6d338912f0523a) // vk.Q_C.x
            mstore(add(_vk, 0x1e0), 0x27a28ec73fe5604698ff0a0c305ed24df5b690b96b4ad63c2e7237c671e2dfd3) // vk.Q_C.y
            mstore(add(_vk, 0x200), 0x0eb50f484810d47cceb02f10d633344275e35f0c2d9480b082055d40652aecab) // vk.Q_ARITHMETIC.x
            mstore(add(_vk, 0x220), 0x2341c79c0f01797611c6643ce5570c9f9c266be32519a838c493df71e308a2ce) // vk.Q_ARITHMETIC.y
            mstore(add(_vk, 0x240), 0x10a219cf9e905e742bae0656be9a85d6d8f80b3ed599bcbfe5adbad4a006af9b) // vk.QSORT.x
            mstore(add(_vk, 0x260), 0x1c01cdc18c29e812f36e9f7c756b2e4ef2eaf57ad0bf85b77f006c76b4e2ecaa) // vk.QSORT.y
            mstore(add(_vk, 0x280), 0x2747b8cf43664363022e5b49b9425c963e5879af56dbff9ca38f6b9fa904a3a1) // vk.Q_ELLIPTIC.x
            mstore(add(_vk, 0x2a0), 0x12dca9b754022b254b20c956dc6e177e686fe9e20bf353b8dbfe52d577a4c3a8) // vk.Q_ELLIPTIC.y
            mstore(add(_vk, 0x2c0), 0x1a719b95265beabb4896c0ba0ae2e2ba912740dcd1ff1241f3916dc0fa60064e) // vk.Q_AUX.x
            mstore(add(_vk, 0x2e0), 0x00ac90b81b7bee3403927a2eac2701e416939060d440048d2f337e78c0e68bf4) // vk.Q_AUX.y
            mstore(add(_vk, 0x300), 0x05b2e53e9332f5fa5cc6f70e700eafbb88533915cdeb4b21b46725f187c232a5) // vk.SIGMA1.x
            mstore(add(_vk, 0x320), 0x0dcdffc63e3a964b3ac2d7303343caa1d3763c25379241c73e03ba4fce96c0fc) // vk.SIGMA1.y
            mstore(add(_vk, 0x340), 0x0f77287038c2d1ba828980a47e3a6e120e8d8be0a69d292b7a24ba1657b5f3ab) // vk.SIGMA2.x
            mstore(add(_vk, 0x360), 0x0942a13c634674c125ac043700df118c0597b7c41ed1e8b751f4aec41cbc889d) // vk.SIGMA2.y
            mstore(add(_vk, 0x380), 0x1b6ae9ac874c985b7b84bc90a87dff5effa6440d9ebbbd516af8cf668d46c8fd) // vk.SIGMA3.x
            mstore(add(_vk, 0x3a0), 0x17b77f03f7681d65ffe750405345ac2762c6bad1887f179b2e1f49b44b84c241) // vk.SIGMA3.y
            mstore(add(_vk, 0x3c0), 0x0a87235ffd0e72f310c131e243c3d461c8f429b4cf603df3ec29a243b9822fe7) // vk.SIGMA4.x
            mstore(add(_vk, 0x3e0), 0x111008ff8e1efe82bbbb3b804e51c6f52d86ffe0e16b7486cc415b74b1c6eb07) // vk.SIGMA4.y
            mstore(add(_vk, 0x400), 0x0c54103c5076b566a2e980d8c88cf32cd21e2f3e27067015fcd8da5ca41bbc5a) // vk.TABLE1.x
            mstore(add(_vk, 0x420), 0x0cc85a3f7ab203e6a42e9f568ad65441754463100016779caba6430ab4418e09) // vk.TABLE1.y
            mstore(add(_vk, 0x440), 0x263b9debf1d5b4cf0f6594bf8077c216d615cd93ae366382b3e53fdbe01c807a) // vk.TABLE2.x
            mstore(add(_vk, 0x460), 0x1c755eedad1d74a8f0fee65618c2b7866128711b124e8aa517733f5101e7164e) // vk.TABLE2.y
            mstore(add(_vk, 0x480), 0x29dbe4b32baef1a697973b20572fd995f4ba1dd66c3742082537085c32f28198) // vk.TABLE3.x
            mstore(add(_vk, 0x4a0), 0x1bf12379b84f99d8e569fd1469f135daa356619de016f4b2873bdf3719932689) // vk.TABLE3.y
            mstore(add(_vk, 0x4c0), 0x1567642efca7cda9eeabeba1b7f9c27c66704c66a5e4b9a766fb5b443c75792a) // vk.TABLE4.x
            mstore(add(_vk, 0x4e0), 0x3028c2a1ed5f96c016655807d31f65dbfa1b3e24e41fb318ae460c571e0169ee) // vk.TABLE4.y
            mstore(add(_vk, 0x500), 0x2249efd3e087a4935aacf144ca161201732553d2138e7b9d2d0b89272ebc319b) // vk.TABLE_TYPE.x
            mstore(add(_vk, 0x520), 0x0f83d243781edc8524a191439c256255328743ae787998353f9b4eb1e6831238) // vk.TABLE_TYPE.y
            mstore(add(_vk, 0x540), 0x19589ca000385db80087b150331bca67eb660a8e247cde3e991a4899daf49b49) // vk.ID1.x
            mstore(add(_vk, 0x560), 0x1217621a37951221252cc4e13a7de552aa1e8e59074648167f9f9994bcf73c16) // vk.ID1.y
            mstore(add(_vk, 0x580), 0x064e12279e35e9eec5ee20ccb64f011ac151ab00a4189ab111c0d43a03ca7cc3) // vk.ID2.x
            mstore(add(_vk, 0x5a0), 0x2b4ce353dceef2621f8b71ae66f18bb152f18a3b45a301e392582730a7ba046d) // vk.ID2.y
            mstore(add(_vk, 0x5c0), 0x2867ba25a1dc623c215a68c4d1627ce3b7f38677c7afe59897a5b3bf8924fad3) // vk.ID3.x
            mstore(add(_vk, 0x5e0), 0x18c204513ed264bd438a2607d1aea0655ee07287b31606e627a9a0784d6ae32a) // vk.ID3.y
            mstore(add(_vk, 0x600), 0x1d093bd126a96053040bee955e413fce8d1e8d2cc4c06fa4876bbb4631c34fad) // vk.ID4.x
            mstore(add(_vk, 0x620), 0x1e6622021f2fc8e69a1351b3a72b98ed1a319a7f9bac52b64d2637e9851ab1e1) // vk.ID4.y
            mstore(add(_vk, 0x640), 0x11ab7a1cae7edaf3641b1cf729afb2e0396d4649a9acb2127a05df56df21109c) // vk.Q_DOUBLE.x
            mstore(add(_vk, 0x660), 0x0a5d2af029b68401792de001554c7513585523a1458a7d8152262f0ff5beb57d) // vk.Q_DOUBLE.y
            mstore(add(_vk, 0x680), 0x00) // vk.contains_recursive_proof
            mstore(add(_vk, 0x6a0), 0) // vk.recursive_proof_public_input_indices
            mstore(add(_vk, 0x6c0), 0x260e01b251f6f1c7e7ff4e580791dee8ea51d87a358e038b4efe30fac09383c1) // vk.g2_x.X.c1 
            mstore(add(_vk, 0x6e0), 0x0118c4d5b837bcc2bc89b5b398b5974e9f5944073b32078b7e231fec938883b0) // vk.g2_x.X.c0 
            mstore(add(_vk, 0x700), 0x04fc6369f7110fe3d25156c1bb9a72859cf2a04641f99ba4ee413c80da6a5fe4) // vk.g2_x.Y.c1 
            mstore(add(_vk, 0x720), 0x22febda3c0c0632a56475b4214e5615e11e6dd3f96e6cea2854a87d4dacc5e55) // vk.g2_x.Y.c0 
            mstore(_omegaInverseLoc, 0x05d33766e4590b3722701b6f2fa43d0dc3f028424d384e68c92a742fb2dbc0b4) // vk.work_root_inverse
        }
    }
}
