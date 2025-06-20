// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.21;

import { Honk } from "../HonkTypes.sol";
uint256 constant N = 65536;
uint256 constant LOG_N = 16;
uint256 constant NUMBER_OF_PUBLIC_INPUTS = 22;
library EcdsaHonkVerificationKey {
    function loadVerificationKey() internal pure returns (Honk.VerificationKey memory) {
        Honk.VerificationKey memory vk = Honk.VerificationKey({
            circuitSize: uint256(65536),
            logCircuitSize: uint256(16),
            publicInputsSize: uint256(22),
            ql: Honk.G1Point({ 
               x: uint256(0x0b1ba3c6f9a4f1a3cf19352d4f71e84c0d96d3f018ab1d9412ab8b5228a7fcb4),
               y: uint256(0x01eecae3ab331ede4900e5a4379f5a7f749f7d557f7e9244a8788dcbeefdeaac)
            }),
            qr: Honk.G1Point({ 
               x: uint256(0x216f9151d1d3a9eca31fe53bc891de3a3846357a5468641c1cd753a84b4212b7),
               y: uint256(0x1721f812b42d7603b7506a521bd914fc01317615962d864332f1dbded501945f)
            }),
            qo: Honk.G1Point({ 
               x: uint256(0x1c1a2b5b883d74fe4a2d2196b9d6f6c48b8e4ba68d925d02652ed319245e63a9),
               y: uint256(0x0bba4329fd98752ef34e0882055e121f2ec66902040edebc1a09b6066dcfb4cc)
            }),
            q4: Honk.G1Point({ 
               x: uint256(0x2cc9e98963ea8e6850ff57f63d05464a1e7c5b12e60b2cc539bacede24d95412),
               y: uint256(0x1db62d03078fc09b5117ee1f06e79082543de1af8b40c3a4d178acd934ca0ea6)
            }),
            qm: Honk.G1Point({ 
               x: uint256(0x1c4658e0e8f99be5efb07d4eb390bb8397affd826584bb6009e5a9aa6a3d91cb),
               y: uint256(0x15128279efbbaa41dae946d8e4a2558e0a66704e69e6e418028dc80e714ffd1c)
            }),
            qc: Honk.G1Point({ 
               x: uint256(0x27b560bf92170548f734f317efe25719655a33263592b9802fa0191efd4a7b84),
               y: uint256(0x29bf273e0787a8dd2c56866b35cb6868eedb591b40662402ddbfc18840a7a3c7)
            }),
            qArith: Honk.G1Point({ 
               x: uint256(0x1711742baa0601c5676eca03f383f77c66bd774db277812ea6bbbc54d70b36f2),
               y: uint256(0x2e2a950d0b204dafcdda4ca762f3c476d8d535f834aacfaae135aeae1ce80462)
            }),
            qDeltaRange: Honk.G1Point({ 
               x: uint256(0x28f6bd7e67c74efa4e9403ca75d9d7e77f69192fee8013b4267d1e2d3f38c4fa),
               y: uint256(0x062098dd085427b3ae08299aeb7c2a5ef5759cb7eaab9985b8291faa768f1173)
            }),
            qElliptic: Honk.G1Point({ 
               x: uint256(0x017d5c7d692859efe9a9e4b4112e998ea72d557665e806486d10973abdb4c176),
               y: uint256(0x24101a2af3fb7507a074b8dbf6105d0d87a7bd97158b1699a5891b2cef2f611f)
            }),
            qAux: Honk.G1Point({ 
               x: uint256(0x1bb2e7b3f824d6146c0fc5594015b8c88af080bf005afbda8012403c7fd73fd7),
               y: uint256(0x0f3b8455f2377bb1f98a5004a95262bab50529f74e48e0b97a410b1b0a55f9e7)
            }),
            qLookup: Honk.G1Point({ 
               x: uint256(0x148815ca04dbcfecb81c13d5339275f8b670d99a36d80115c6c632ad74e4bb2e),
               y: uint256(0x158c91fa2cb7239b8ed4514762fdefe02bf610e31c09c1a7e483716d1c0079ea)
            }),
            qPoseidon2External: Honk.G1Point({ 
               x: uint256(0x0d5ae2cb4d426fcb5bc5794b03533ff5d0c8b795c703466f56680b03ae1efd9f),
               y: uint256(0x0bc32183dd2fc2511060267bc5c2b9f70cc578479247de0a06af2fb2e6c4b31c)
            }),
            qPoseidon2Internal: Honk.G1Point({ 
               x: uint256(0x22e4a9db922afe802d936b35b7cf31829c5cab7f31f9d29d5075d27c2cea26d8),
               y: uint256(0x01c423638068d41ae359957c84d4d0b4d5c43385c5294ade42d5eeb862ff56e9)
            }),
            s1: Honk.G1Point({ 
               x: uint256(0x027782ed1134884af611f8518ff6b4c93341395782c61a9284718a47544c5a54),
               y: uint256(0x0c9d6cf52647dbdb2db16b1ed50ea72464a485ced4c324b65c54427b35c59656)
            }),
            s2: Honk.G1Point({ 
               x: uint256(0x01abcef6060f6f7fe81e2ffc57159b9dcee2ac8161c50b263bd385d1345d979f),
               y: uint256(0x036ab6c18ecc604ce9b1ef9625bd974de2c8f667423c8f2ddb8e53b21e4d1e3e)
            }),
            s3: Honk.G1Point({ 
               x: uint256(0x1aba2c9d4dac137ed8b854296c0949a05b7d97861238d0114516db1b6453c67f),
               y: uint256(0x063a6dedb8b85bd2c53b6287ae2571141ce1f6dd9d5208086b158afbff3fbd87)
            }),
            s4: Honk.G1Point({ 
               x: uint256(0x035dfcac45d686de1cf6dd6370fac43f8bf9f8570bcacbcb0c603f1887c71a50),
               y: uint256(0x093aa2439d47d8d221a61bb1959b6baaa4a980c0e3e33efa470be3c0e61a9f39)
            }),
            t1: Honk.G1Point({ 
               x: uint256(0x0b7b8581cf25a963e5ab081785d7a70504db9b8b710bd019de5be4c980a6536e),
               y: uint256(0x0c9c04b32d4d51cc162b703f571ad5748859b9133c961345d71273183f2a68b2)
            }),
            t2: Honk.G1Point({ 
               x: uint256(0x2d073920df90f0f98352d5bfc545f19e9622f5fa49d82300e5afb9acb6d030fd),
               y: uint256(0x0cd29f3121acf9430707827d9b0805f991402d944261e1d648d9c08c7cec5475)
            }),
            t3: Honk.G1Point({ 
               x: uint256(0x1df7f08d004e38c6cc24155081bf68c1a6444b526bd98beea00feabc8ea337f9),
               y: uint256(0x0471714279ef8a51213c70cb4fa89e73caf1ad84fa8c1447f41f6eb6bb897491)
            }),
            t4: Honk.G1Point({ 
               x: uint256(0x1d794f2aaa0524cb1d97c2ff125061a697ec693323edcff93f0e5a59bcd2101d),
               y: uint256(0x1baa78d0546b9e189379cc5a85c90293b8c30eb1e6955e421866ef4454222a92)
            }),
            id1: Honk.G1Point({ 
               x: uint256(0x0de8b311de8c05690c3086ee185071c96f2fba2e479bd698b45e0b82d2dc04b9),
               y: uint256(0x244ea8b34cfdb39c770e37b1658d17b5a4369418006bc9c1b0d3e15b90d7487f)
            }),
            id2: Honk.G1Point({ 
               x: uint256(0x0d75a68b1392b14f2150b288e68066e3418cbdbfd30eb8c2d9c689698f85be8c),
               y: uint256(0x09a11258632fdf90eeaa26377fdb7efccd6ee64f502d6e2e5d52703e0c057940)
            }),
            id3: Honk.G1Point({ 
               x: uint256(0x1f0ea94b74cbb2a5e7a17527b6e39a77822fd4a6cf5517b9339689c3f4f9225b),
               y: uint256(0x173c4f3859e1328f0c641c08cde97f2e69bc727f54170eb856e4e6cd4bac0fc6)
            }),
            id4: Honk.G1Point({ 
               x: uint256(0x20cfa1a8ee47b53fd27da5f27ed10427a6776c4aa6500b50910092fd158a67f9),
               y: uint256(0x258c7d8943a53fdc2dc997858a229844c188458ce7535a16d5f6b73c4bdc94e2)
            }),
            lagrangeFirst: Honk.G1Point({ 
               x: uint256(0x0000000000000000000000000000000000000000000000000000000000000001),
               y: uint256(0x0000000000000000000000000000000000000000000000000000000000000002)
            }),
            lagrangeLast: Honk.G1Point({ 
               x: uint256(0x28f1a32f5393f11495a6ff549f8c63a1220210306b6cd2672be2754aa59cfed9),
               y: uint256(0x153f104778115ee6def6ed6bac8530fe34bc7557a25b30e47be45f24c02e16de)
            })
        });
        return vk;
    }
}
