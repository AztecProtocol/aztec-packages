// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.21;

import {Honk} from "../HonkTypes.sol";

uint256 constant N = 4096;
uint256 constant LOG_N = 12;
uint256 constant NUMBER_OF_PUBLIC_INPUTS = 19;

library Add2HonkVerificationKey {
    function loadVerificationKey() internal pure returns (Honk.VerificationKey memory) {
        Honk.VerificationKey memory vk = Honk.VerificationKey({
            circuitSize: uint256(4096),
            logCircuitSize: uint256(12),
            publicInputsSize: uint256(19),
            ql: Honk.G1Point({
                x: uint256(0x0480a80b708d88511983399d7d454290cd7fc44f01efd7cd0adabac1da5209b7),
                y: uint256(0x2ae668b0ee73a123a9d90f5783ad3d938b72e3c7ff79fcccab796e842df5300e)
            }),
            qr: Honk.G1Point({
                x: uint256(0x1e7aa9fecacfbc874d011c148d75930b51c940588e6a380e41f799f9c69cfb88),
                y: uint256(0x0b9b4ac921dfc8ce57cd538fbf365383670134d46e36172ddd5e919aab0f69fe)
            }),
            qo: Honk.G1Point({
                x: uint256(0x1437c61970e925d118c52500d70fdec2627ebaf11f852f8e66a76b82afa3ea93),
                y: uint256(0x040aed815fb4f06a542b29eab919ba12c05fcec2b8bfc3fc17f17252b351c403)
            }),
            q4: Honk.G1Point({
                x: uint256(0x130299a3b761af9bf2809e404253b8dc1b8e6407be62e0a89f4106ca49b0033a),
                y: uint256(0x0ef4c1da391bce25d5409f561aa780d47421ea5ad41c47a349d856e28f77dec0)
            }),
            qm: Honk.G1Point({
                x: uint256(0x188b95520aec60631d6c9f859d03f2660aa5396ebf6027e62138cfc688e5cfe3),
                y: uint256(0x235b0bf1b35296e3fb8fd63cac59c1dca6cfdfa55c8fe77761274d12e666faf3)
            }),
            qc: Honk.G1Point({
                x: uint256(0x21d8806ac728214aef9480cd6dceaab8c9a1683787bb21423977d63da55d960c),
                y: uint256(0x1e71d022986981a229c8c5285409169bf87b9d5b84027a71f29c1359ffabeac1)
            }),
            qArith: Honk.G1Point({
                x: uint256(0x1825408d0a4ad62b99c1e6929154bad54a08a289b15dab146e2fb6fa0573a023),
                y: uint256(0x141d09f0721f2b88a1916e6535ab3daa95c19a8136892c58d1ed0f77868a6df1)
            }),
            qDeltaRange: Honk.G1Point({
                x: uint256(0x25e69836196abcbacfc1c9a2bf7cc19417d235d8583a345fe1df0337c86f0c28),
                y: uint256(0x00125a28683d96529c25b43a56648781127e4c1aec43349a37abdb4b77598a7a)
            }),
            qElliptic: Honk.G1Point({
                x: uint256(0x025c989a5fbbc39a745dfa0c526d1b2c120d25144b16975f344bb8e0911f50aa),
                y: uint256(0x17dcb48f840e14a56297e5e157ab5d29c1683a4f2321682c17677f325c27de6a)
            }),
            qAux: Honk.G1Point({
                x: uint256(0x0cdc2b5a596a86075ab9b8002e5d059f5892fd0adca08af7396603fc72b0bce0),
                y: uint256(0x23878876a1de9fe1501ce3c87e0c114f5e6674ea0ef1783f6ab01456d29b8b2c)
            }),
            qLookup: Honk.G1Point({
                x: uint256(0x0073e7c223dd4f3e4734c4d9d9c9df394bd2eee2e12bac2fc49429a0443ec8b0),
                y: uint256(0x20fac57db30195c2427a75a4d67231c1d1c74c8f84f009ab21d3c88e9657403d)
            }),
            qPoseidon2External: Honk.G1Point({
                x: uint256(0x2e9f808391ab789a4ab3535811011dbe1c6f8744e1d54c948f8d627d538fb965),
                y: uint256(0x089a480cc0c16c07ec1621b2917fbf6130f90c4da39e70a7213c6ebbf8768e05)
            }),
            qPoseidon2Internal: Honk.G1Point({
                x: uint256(0x1e05165b8e92a199adc11aafdf37b7fa23724206b82e0864add6d4d3ef15d891),
                y: uint256(0x1490b97e14d7a87ab24c2506b31a5f1c19e519f9e46735398b7d7d3a6e8b6291)
            }),
            s1: Honk.G1Point({
                x: uint256(0x16cda87b3802f84584944045d649e71fa3d94bef9516a02dc5b65e4d0c00ec9e),
                y: uint256(0x2da20b51668b47d0171289f24d05b1103ac3dbeca063759c4a6f0263c34cb9bb)
            }),
            s2: Honk.G1Point({
                x: uint256(0x29ebded87910c73b9a7a38696b4f524c210dc9cbc925503e63f5179a0063bbf3),
                y: uint256(0x198b83df6c73f8270c4947b862eb8e545a0099dd6e91461a238cdb3ae1fa8e54)
            }),
            s3: Honk.G1Point({
                x: uint256(0x1f5a56c28eb137b2cea1d02d685a239b001bb1d7a4edcdff6f11f9712720499c),
                y: uint256(0x072be0750ed4fa1b7a05e0cd3e433bdf460f08812d4ef890aab546a99f2004a3)
            }),
            s4: Honk.G1Point({
                x: uint256(0x20e3972fd9811bbcca299306ef497d05572088c59670057dc4dae8048b4aba2c),
                y: uint256(0x04f23dc95589380c68db9f021154e99b7fc366955b28f8929f760fae9110562e)
            }),
            t1: Honk.G1Point({
                x: uint256(0x004067623374b7c3965c7d8444b57ac2d81269c7eb3cb4f7b16568b2f8234c96),
                y: uint256(0x0e605f3ad72203e21301ef1b5333cae1d8063220d1996854beb0c4fbc33bba9d)
            }),
            t2: Honk.G1Point({
                x: uint256(0x17aafa80bf54a7e6cc66472f9ccd70efa5044207a95191716ba0195b5a432266),
                y: uint256(0x233ecaca2ddbebb0484a44e6f55b8c8614c7b5e0ce31b51d59d6b21322a307a1)
            }),
            t3: Honk.G1Point({
                x: uint256(0x1466af934dc34b082708b0a26a61dae7d9d859cbd4661cfab6abf34e827d9d2a),
                y: uint256(0x2666bf4c8a2aef1ab89aafded315580561c9d4a13f3ac4b255b478f544590eda)
            }),
            t4: Honk.G1Point({
                x: uint256(0x0765bf6645e4cf63f05d9b0efd06acebce309c685a3b05e613574ccd7316677c),
                y: uint256(0x09770f145625290cdcb08bae4e6f0a26897b5988fbaf9529e0a3326bfdb537ae)
            }),
            id1: Honk.G1Point({
                x: uint256(0x0ffce107ff8ebcb19b485768694ea436c218020919c9ab3d6e514ba59ee6e2f6),
                y: uint256(0x00b7d25d98e26c1d80ca46c3cb684bbdda7ba4e34973c8a9d574151b0f365986)
            }),
            id2: Honk.G1Point({
                x: uint256(0x1fb7a537b284e0a8dd00b5b6f6818776cc0a6b9782177cd62ee09f1ee019026d),
                y: uint256(0x173f13ad7ecab8c2a508ea61c34542e00255cef4e0b6fa411b3ddfe1618f4cde)
            }),
            id3: Honk.G1Point({
                x: uint256(0x197f3201b9f527fffe064a8498a3b38e3e684a818b41a80e710b5cc2280e7495),
                y: uint256(0x03d64a4e046d0116a4755c761941b7df2a1cafef4aca04d7f9e6d6263ed05e58)
            }),
            id4: Honk.G1Point({
                x: uint256(0x2fd2cbd4d1473616cdd20e762cbf86625d6af6bcd61ad68604d47173129a4ca0),
                y: uint256(0x12f80941ba7c8d911e25468671150c17c843dfba54c895e16bdbc34f64053b03)
            }),
            lagrangeFirst: Honk.G1Point({
                x: uint256(0x0000000000000000000000000000000000000000000000000000000000000001),
                y: uint256(0x0000000000000000000000000000000000000000000000000000000000000002)
            }),
            lagrangeLast: Honk.G1Point({
                x: uint256(0x07f297c18cac336c36c9f1bf47a6cc72a29897c839975dc0ea851e7389daef00),
                y: uint256(0x2718595b1a90d94e57e7a01055dcbf70ec06a323403044676a660e3719cd822c)
            })
        });
        return vk;
    }
}
