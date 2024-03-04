// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.4;

import { HonkTypes } from "../HonkVerifierTypes.sol";
library Add2HonkVerificationKey {
    function loadVerificationKey() internal pure returns (HonkTypes.VerificationKey memory) {
        HonkTypes.VerificationKey memory vk = HonkTypes.VerificationKey({
            circuitSize: uint256(0x0000000000000000000000000000000000000000000000000000000000000010),
            logCircuitSize: uint256(0x0000000000000000000000000000000000000000000000000000000000000004),
            publicInputsSize: uint256(0x0000000000000000000000000000000000000000000000000000000000000003),
            ql: HonkTypes.G1Point({ 
               x: uint256(0x0c2906acd1aacace24d0e944c6a938e171d89a12c3b46d00a81559ecc786f59c),
               y: uint256(0x1e37525c5d9d17d7b8c91c47557d386c5d6ce8ac0781c5de9534a2731cc0eb7d)
            }),
            qr: HonkTypes.G1Point({ 
               x: uint256(0x0f9150b0c2f119b1094ffe47aa0ec41b95cefef6b2b47cebe7f1f4896e68c4f9),
               y: uint256(0x1caabadfad3f70aaf130b1277ce4c9ea0644f3b55d54757d9d807c8f53ad4f34)
            }),
            qo: HonkTypes.G1Point({ 
               x: uint256(0x034508a9493302a48be6afae04db6214dbf89c1a51b18df8d1c6f3f89fc0eefb),
               y: uint256(0x103efd964e97320344e3cc29f87389b8674a24adfcda2373371ab7dc3cfaeca4)
            }),
            q4: HonkTypes.G1Point({ 
               x: uint256(0x1306753305d3fa4348c192cfd63d0667e97de1a27403858f3c0c342481aed46e),
               y: uint256(0x0ac1215d99e3db5b0e552a1b0d879d2961085bfbff07746245a17f1d50178dfa)
            }),
            qm: HonkTypes.G1Point({ 
               x: uint256(0x180b10e27fb86a823b9fc1fb9105413db2a857c3cc642453840b5c0a7ed06dad),
               y: uint256(0x29c7030065e1720c10ce7a736f97193176568f1aa25c32cfee61e77c659797be)
            }),
            qc: HonkTypes.G1Point({ 
               x: uint256(0x08ab173bd204583da64da29f5902e15e935b62dba86173d6213163187815e071),
               y: uint256(0x1d26b8b6d076adc0aa29abf46f4664e7980759bf47b97fa5850ae99518b948b7)
            }),
            qArith: HonkTypes.G1Point({ 
               x: uint256(0x19d643a46caea1b10688d13068e9c24c6618f66ec6f175417b9eabe0677db61a),
               y: uint256(0x08c3cfeaaabfd15d141effa21e9f24da4fc1c89f9e063ee7d1ba201329cc5612)
            }),
            qSort: HonkTypes.G1Point({ 
               x: uint256(0x262d212add82bcbcf96d0773c59926e1b8e68e45c662f9348f2e4f64770595b3),
               y: uint256(0x2fe4de705da2b7bfb03cb3baa199ed4cc97e6ce620d0e939b603493223e88703)
            }),
            qElliptic: HonkTypes.G1Point({ 
               x: uint256(0x262d212add82bcbcf96d0773c59926e1b8e68e45c662f9348f2e4f64770595b3),
               y: uint256(0x2fe4de705da2b7bfb03cb3baa199ed4cc97e6ce620d0e939b603493223e88703)
            }),
            qAux: HonkTypes.G1Point({ 
               x: uint256(0x262d212add82bcbcf96d0773c59926e1b8e68e45c662f9348f2e4f64770595b3),
               y: uint256(0x2fe4de705da2b7bfb03cb3baa199ed4cc97e6ce620d0e939b603493223e88703)
            }),
            qLookup: HonkTypes.G1Point({ 
               x: uint256(0x22011c91613251ef53fd12a397e4bd6165b1ed309dcd94b33ac4226d34b68889),
               y: uint256(0x1fb02875a3542a3a6f4426ad912b70cf32b444a8e439701da6e8e7b30029cfc7)
            }),
            s1: HonkTypes.G1Point({ 
               x: uint256(0x25c2930a65bbf57b5e5d1a05be3cdc2a55e125c15581df52a0adbe8d452ecacb),
               y: uint256(0x093614469341c4ad1d182f6fe742838965227b0369008a19d83cb29182410717)
            }),
            s2: HonkTypes.G1Point({ 
               x: uint256(0x2a08b8cedc25a1ff4a4958c203337de17295eee8c58b8eabbec6eabdbe7e1113),
               y: uint256(0x29abf3f0b521cac786410af4e60319587f8d81dc49a8cf213ecf91998e46a75c)
            }),
            s3: HonkTypes.G1Point({ 
               x: uint256(0x26be685e6ae13bf25fec714c79aa1a7d0cc18e28c5f726c1bb87477d5d5adf3a),
               y: uint256(0x2446c304ac925055a3feb804c564ea48cdccfc88c77321f1ddc82ae352f3a30e)
            }),
            s4: HonkTypes.G1Point({ 
               x: uint256(0x1d1f8a5f7d4d0d52d41c4fba1b5592789fe9dfae948d1ea2b18739b75ff26177),
               y: uint256(0x070ad9fc8e1e0e5510493c2aeb331dbdf5974cefa5b8c8b55c35620863b67ab4)
            }),
            t1: HonkTypes.G1Point({ 
               x: uint256(0x224948ddbcddb1e360efa2ac511aacd0d3258758dfa9bae9e415f6d48d990e16),
               y: uint256(0x1011627c159ab9f3ff0a0416a01df6f6a101330e9f928dc80a3d3b9afefb373a)
            }),
            t2: HonkTypes.G1Point({ 
               x: uint256(0x18dab63316305864682bfe7b586e912ec420ad50087360c152c131400547bcc6),
               y: uint256(0x1edb4d30542aa0ac4fe8eb31fc2ce04bd9f352c132c7ae6bed5ea997693e6300)
            }),
            t3: HonkTypes.G1Point({ 
               x: uint256(0x27a49cd522a4fbbdfc8846331514de8bcf42c24591e90cf41fc687829fe0b0aa),
               y: uint256(0x1432caafa62e791082fd900fcb34a1bdfbf1d964fcfb887c3631ef202797fc2f)
            }),
            t4: HonkTypes.G1Point({ 
               x: uint256(0x07ea92c2de0345ded1d25b237f08456f99a40f79f14ed78a291d53d0425ddc9d),
               y: uint256(0x255aeaa6894472e3cb6b0a790cf290bc1328fa2c343da93cb98486d414f0a40a)
            }),
            id1: HonkTypes.G1Point({ 
               x: uint256(0x1379b3c1d5a03480236da627cb2476b0a469ace185006dd094cb5f9b3d9ec9c1),
               y: uint256(0x0ba7fea031d2300a82fc47286e81b32c8b2b2749df72adc2713c523904a938c8)
            }),
            id2: HonkTypes.G1Point({ 
               x: uint256(0x0bfc5c698f087eb3c9172a40e996a7359e0d0dddc76b00af91cbc962658a1459),
               y: uint256(0x1cbea184d54a10328d938a1e5026ccdd3168e2390a6784bab54c016b8a4bd303)
            }),
            id3: HonkTypes.G1Point({ 
               x: uint256(0x16b6ad6c75d356880cf7e78cf8ea806427a7731f962d35b991a90dc8b5149078),
               y: uint256(0x141c54c91bf595e191b4e9451b4f5a2e12676a9383c91eb512217b69ac1f4a1c)
            }),
            id4: HonkTypes.G1Point({ 
               x: uint256(0x245798a7b19502ba14b46eb68dc771a0875603e0a017ce12ff79764af43e7421),
               y: uint256(0x08b8347d14433adba1d9e9406eb1db89b25e854077925674d0645ed1e784c929)
            }),
            lagrangeFirst: HonkTypes.G1Point({ 
               x: uint256(0x0000000000000000000000000000000000000000000000000000000000000001),
               y: uint256(0x0000000000000000000000000000000000000000000000000000000000000002)
            }),
            lagrangeLast: HonkTypes.G1Point({ 
               x: uint256(0x024236bda126650fb5228cf424a0878775499e69e8bd2c39af33bd5fa0b4079a),
               y: uint256(0x233cda9292be02cfa2da9d0fc7b0eab0eb1a867b06854066589b967455259b32)
            })
        });
        return vk;
    }
}
