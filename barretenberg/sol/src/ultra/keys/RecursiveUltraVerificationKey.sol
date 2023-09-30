// Verification Key Hash: a8dabfb148c9d3399b50af1e3d715ffa30d3639eb93f140486f66fe2cc7656a2
// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.4;

library RecursiveUltraVerificationKey {
    function verificationKeyHash() internal pure returns (bytes32) {
        return 0xa8dabfb148c9d3399b50af1e3d715ffa30d3639eb93f140486f66fe2cc7656a2;
    }

    function loadVerificationKey(uint256 _vk, uint256 _omegaInverseLoc) internal pure {
        assembly {
            mstore(add(_vk, 0x00), 0x0000000000000000000000000000000000000000000000000000000000040000) // vk.circuit_size
            mstore(add(_vk, 0x20), 0x0000000000000000000000000000000000000000000000000000000000000010) // vk.num_inputs
            mstore(add(_vk, 0x40), 0x19ddbcaf3a8d46c15c0176fbb5b95e4dc57088ff13f4d1bd84c6bfa57dcdc0e0) // vk.work_root
            mstore(add(_vk, 0x60), 0x30644259cd94e7dd5045d7a27013b7fcd21c9e3b7fa75222e7bda49b729b0401) // vk.domain_inverse
            mstore(add(_vk, 0x80), 0x2f2c90833604bd86de6481e803333729ec1dcd596a71739edefefee57817e992) // vk.Q1.x
            mstore(add(_vk, 0xa0), 0x0ad2a1eb5e5a57a55048f2c60217216fa4e2422ec1f9b850e8a07ffe331d1b81) // vk.Q1.y
            mstore(add(_vk, 0xc0), 0x2c70e5eee73ca1969c8512a2d84885a2bb0b890adb96f3a850ff7cbcb9a65b9c) // vk.Q2.x
            mstore(add(_vk, 0xe0), 0x24c771c3028ebd2c07965a66e94078f65498303131c49a8e246ca2a078f10d60) // vk.Q2.y
            mstore(add(_vk, 0x100), 0x105065ec980ad5ee684500b464f64c95958de691d9332cc6bdfb747a5bd1093d) // vk.Q3.x
            mstore(add(_vk, 0x120), 0x15495341b86f7b1445267dcb4ca76dfddd1bff4e90f7cb19fc8b80633d6dce00) // vk.Q3.y
            mstore(add(_vk, 0x140), 0x02316424c80b59722a41ac1c5f1ede7c3b95ef191d3db1899722d49f99013fdc) // vk.Q4.x
            mstore(add(_vk, 0x160), 0x1a4e9a425b6bc79f450751a518a2c02a5c86b685dc911b846f8dc121ee8f9558) // vk.Q4.y
            mstore(add(_vk, 0x180), 0x1ceb4161d0d9a399024bc19a3fd1a184650dfe0ccb37469bf9f32310196bb594) // vk.Q_M.x
            mstore(add(_vk, 0x1a0), 0x2d70e55f7265db59f12fe29a4b02b663a7cdba8c7f2d63591daa6c54c2392b6e) // vk.Q_M.y
            mstore(add(_vk, 0x1c0), 0x0ba551c12d9c22d637af327fafa554770ce46cd3cf15084f238d5813ba6e05ca) // vk.Q_C.x
            mstore(add(_vk, 0x1e0), 0x26525a633d3dd0565239e7db3b2f6a6d96817b57d102567b964097f63aada6c1) // vk.Q_C.y
            mstore(add(_vk, 0x200), 0x2f837b8a968e1b6d665b92060f96595fa8aa2a675a6630eff1112b60a0ac19d7) // vk.Q_ARITHMETIC.x
            mstore(add(_vk, 0x220), 0x0764fac48c1b543d7c058b38f17a0f95405ac630f9b4daa7fe3acb4facd37ed3) // vk.Q_ARITHMETIC.y
            mstore(add(_vk, 0x240), 0x23c6a34548f5989e63ec5cdc25bb05a47b969d5e5b0b4ef0bc1b0607e383926a) // vk.QSORT.x
            mstore(add(_vk, 0x260), 0x080512a33b05eeb174062cbb5ab4dd2478112f1432a6337e87f8c0a189032c6c) // vk.QSORT.y
            mstore(add(_vk, 0x280), 0x14adaaacd19a459bf15d18c5fc6ee9be611be715beb12108fc6d260c2c235f10) // vk.Q_ELLIPTIC.x
            mstore(add(_vk, 0x2a0), 0x22134c82ca56ad624b6eb6358a4f8ecefed559ddf2d9522283c1da573a64aa7d) // vk.Q_ELLIPTIC.y
            mstore(add(_vk, 0x2c0), 0x1ad25cef7959702475e235ccfd0e9e87370806ba6dbdd7f981282d1eaa48a9c4) // vk.Q_AUX.x
            mstore(add(_vk, 0x2e0), 0x2ec523372693163ac5ef50b7dfae09eb9827c55bb2019dd6651a1e7db083a7bd) // vk.Q_AUX.y
            mstore(add(_vk, 0x300), 0x0942025470e1f8f9be686f24005bafbeb9b0a7398d2e649a18f46d4736d0d8e7) // vk.SIGMA1.x
            mstore(add(_vk, 0x320), 0x1c8786222727ba12528582d42407d33b9d766a078531f6870a95bf0414c91246) // vk.SIGMA1.y
            mstore(add(_vk, 0x340), 0x13f058f4907e7300adbcf7971e9b2392410c691fa231908b89dfe57a48f0db2f) // vk.SIGMA2.x
            mstore(add(_vk, 0x360), 0x0db38268d9096842729cf21b9370e61bb9c33802e8b7c43f4b30d198a0f3137d) // vk.SIGMA2.y
            mstore(add(_vk, 0x380), 0x16c43a0a7fef44604e6bb65fe5ae112806114c10a2aa120f1150b696df13fd08) // vk.SIGMA3.x
            mstore(add(_vk, 0x3a0), 0x2148dc36391535837f567f330ad87224c119ebdfa1044cf8e7e0e692d2e9c1c0) // vk.SIGMA3.y
            mstore(add(_vk, 0x3c0), 0x130781ec1dfc6e8cd089c440ea04c5716e51e44fd03efbdda5a0decf6bf01754) // vk.SIGMA4.x
            mstore(add(_vk, 0x3e0), 0x2e5607f269c888b9a9063a173691580cc793f43a82ebe6b33666aa7946bfba3c) // vk.SIGMA4.y
            mstore(add(_vk, 0x400), 0x216ef2bf7bed0508c8d7ca99559246fb7265065fc21f16e69c1891d794c0e698) // vk.TABLE1.x
            mstore(add(_vk, 0x420), 0x0e9565ad0eb5038d5cf58c9716d54067c4a73dbcf2e2eab2228735629bc64fb6) // vk.TABLE1.y
            mstore(add(_vk, 0x440), 0x17652847af0b05a5776d27d831050ecd25c31bac7eb6ba3d832805b8dd05bd02) // vk.TABLE2.x
            mstore(add(_vk, 0x460), 0x230ef10004f842fe992118e4d3c0d8e14bc9d57d5a4d63b7d9ff584cf2a968fe) // vk.TABLE2.y
            mstore(add(_vk, 0x480), 0x11faa2e6cc341451219a77298be335966fcc01031221370fd59ec6fcf7ac719f) // vk.TABLE3.x
            mstore(add(_vk, 0x4a0), 0x2146fa1eb5f133c4aa8598fa0c15c1886c6b2fd38c48a91b9a1238f18036734e) // vk.TABLE3.y
            mstore(add(_vk, 0x4c0), 0x1022741f154d1d684bf4a3afc11ca74b23ab44557965943286d639e1a3fc9193) // vk.TABLE4.x
            mstore(add(_vk, 0x4e0), 0x03a46a44158452a0558742da4a669e2c3c32e95fbfc159cbe9ed7dc7f92e16fe) // vk.TABLE4.y
            mstore(add(_vk, 0x500), 0x23d4017903bdf2fee87100a78d994d994e6132134491138fd1db85c1431274a4) // vk.TABLE_TYPE.x
            mstore(add(_vk, 0x520), 0x06318fd022ba9b51b046df289ee7d0d3e41460a6c919827b162c24209e791007) // vk.TABLE_TYPE.y
            mstore(add(_vk, 0x540), 0x18e8c95df03c5789b033ca41f72a7c223aa5a7f125b133a9c992c484c8e51784) // vk.ID1.x
            mstore(add(_vk, 0x560), 0x29671ef8ebc5cb6a7abae8ec76abc3dfabfe9d1cc149e5508481d739178cf6c6) // vk.ID1.y
            mstore(add(_vk, 0x580), 0x2d548b87e1a1c2cb5687893a02280ad06c9c902f97471933f49fbf68a0e85ad4) // vk.ID2.x
            mstore(add(_vk, 0x5a0), 0x1e5d9e43ce7a58507868502a0afd7ff9a3a7a842624e65c2fb5194bcfbd024b9) // vk.ID2.y
            mstore(add(_vk, 0x5c0), 0x25bbe61f5f0e476d00e7a19c346bb5e2e51b3193aa46b97f641167ce31140323) // vk.ID3.x
            mstore(add(_vk, 0x5e0), 0x2a32688b64a54dc6a77c5dce2ad76b916a1b50dc18c8cb9df95a8d91e8b9df0a) // vk.ID3.y
            mstore(add(_vk, 0x600), 0x2ad02e4af57c8f6528ff199b2da2f393a7a34cfcdd5ce2bf9b2939525d35e2d1) // vk.ID4.x
            mstore(add(_vk, 0x620), 0x16be74261bfb7a4490c65163f121103f5fcee2d8f259722ea1e76f96007eb0e6) // vk.ID4.y
            mstore(add(_vk, 0x640), 0x286b5e87c07e6bfb9f1b4dd9b2758f6abbe43245a0e9e8e6a81778ffec9f3edb) // vk.Q_DOUBLE.x
            mstore(add(_vk, 0x660), 0x2afe03cafd4700d14adecb1f54be2e983f0ee45d675e388cef839bba868ea2b2) // vk.Q_DOUBLE.y
            mstore(add(_vk, 0x680), 0x01) // vk.contains_recursive_proof
            mstore(add(_vk, 0x6a0), 0) // vk.recursive_proof_public_input_indices
            mstore(add(_vk, 0x6c0), 0x260e01b251f6f1c7e7ff4e580791dee8ea51d87a358e038b4efe30fac09383c1) // vk.g2_x.X.c1
            mstore(add(_vk, 0x6e0), 0x0118c4d5b837bcc2bc89b5b398b5974e9f5944073b32078b7e231fec938883b0) // vk.g2_x.X.c0
            mstore(add(_vk, 0x700), 0x04fc6369f7110fe3d25156c1bb9a72859cf2a04641f99ba4ee413c80da6a5fe4) // vk.g2_x.Y.c1
            mstore(add(_vk, 0x720), 0x22febda3c0c0632a56475b4214e5615e11e6dd3f96e6cea2854a87d4dacc5e55) // vk.g2_x.Y.c0
            mstore(_omegaInverseLoc, 0x036853f083780e87f8d7c71d111119c57dbe118c22d5ad707a82317466c5174c) // vk.work_root_inverse
        }
    }
}
