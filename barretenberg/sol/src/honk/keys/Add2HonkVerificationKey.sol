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
                x: uint256(0x146befe71bfafd7c8cacf465bc0f6dba8fdd56185107db610953dd288c8ac4ef),
                y: uint256(0x1dbac6c97cd87f07224a107deaa892a4351fa3a6c66c0b546c74d9183cfcc0e2)
            }),
            q4: Honk.G1Point({
                x: uint256(0x25a10a105906332d55a826bc2deea34ea123efabf2bcbe0aa480f07b4afd990f),
                y: uint256(0x16cfacaba0fa48b46c8872e4e1006d63269f1028e8ad6541a15e55c50109efdb)
            }),
            qm: Honk.G1Point({
                x: uint256(0x011aa91dcbc9f73a47cf04fbb009c601b9d38faad1fe4e2769fb68a05bb79029),
                y: uint256(0x1188cea81d85d65acc2612fdbf9efe6fe3acd41065d2e31b0d20dfabd0645015)
            }),
            qc: Honk.G1Point({
                x: uint256(0x21d8806ac728214aef9480cd6dceaab8c9a1683787bb21423977d63da55d960c),
                y: uint256(0x1e71d022986981a229c8c5285409169bf87b9d5b84027a71f29c1359ffabeac1)
            }),
            qLookup: Honk.G1Point({
                x: uint256(0x0073e7c223dd4f3e4734c4d9d9c9df394bd2eee2e12bac2fc49429a0443ec8b0),
                y: uint256(0x20fac57db30195c2427a75a4d67231c1d1c74c8f84f009ab21d3c88e9657403d)
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
            qMemory: Honk.G1Point({
                x: uint256(0x0e37d60ed408d667df8521cfb6c11199144f17385f52e99a2cf25aa42d5b519e),
                y: uint256(0x10e512a55f0b0f6843162f54501142264e8a0b784700897fec19f0d2dc956076)
            }),
            qNnf: Honk.G1Point({
                x: uint256(0x0671f0554a8d6cb5ad4babb7b649e0f980cba43095f503f1089195afbef3a909),
                y: uint256(0x1b00274b15fea30b24d6388f95ed6c5abf1821cf05d2f63aeaab68d29a3c0b89)
            }),
            qPoseidon2External: Honk.G1Point({
                x: uint256(0x1e05165b8e92a199adc11aafdf37b7fa23724206b82e0864add6d4d3ef15d891),
                y: uint256(0x1490b97e14d7a87ab24c2506b31a5f1c19e519f9e46735398b7d7d3a6e8b6291)
            }),
            qPoseidon2Internal: Honk.G1Point({
                x: uint256(0x0f87e2add2aecbbb44ff4d16be602514b0c3fcbf5d33c2dc672ebe1d288060fb),
                y: uint256(0x1ed340000e71abffb57d96455891648518d41edccc459afeec240ec3c2d708e6)
            }),
            s1: Honk.G1Point({
                x: uint256(0x264144dd89013baad68f58a7ed1bee299d3cb30cef72c74f8281e54f393f992d),
                y: uint256(0x1003297e229a545f611c421bbaadf4d4997c48ef653715c33bcb5e946e00da73)
            }),
            s2: Honk.G1Point({
                x: uint256(0x08a84242ac40108d36e4c353a0f53137b19f6605fef5357835f1c57672127246),
                y: uint256(0x1f745be60bc64aa2c8fed031e02f28fb41d7bdf195734f3cdd98540e2f27b6ea)
            }),
            s3: Honk.G1Point({
                x: uint256(0x19f3714d613fdb9affa560dad993f689d244e15925fa8dbf102107dd45d2e3bb),
                y: uint256(0x2f039724fd4feea838c73b8317d4e43e75b81af5630fa723e2f5c474b486ea3e)
            }),
            s4: Honk.G1Point({
                x: uint256(0x1d9551766b9ee2591e7eb430a0b5bb52ffde35ca49de4f3de1461a24db3baebd),
                y: uint256(0x2bad3f850fdace27dbee1d25cd3d8f16eb76a973e7ece72335e37d5b7c8dbfc0)
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
                x: uint256(0x05bfb4ce0a9f6a69fb44205a742406e8ecd6195effb821fd74673f143b8fb784),
                y: uint256(0x0cb4d1ea4ff2bbae4408bf5c042142805a5c269d2e04f39bc381e217ce7b7fa5)
            }),
            id2: Honk.G1Point({
                x: uint256(0x046c58b359c4b8877f65d0495cbc0ad2969f90382b6440180e10dcd89f01970a),
                y: uint256(0x2ad062995f3aef527ee973dd72d46e673b8cd73b21cbf1de37684c7c3b73c77a)
            }),
            id3: Honk.G1Point({
                x: uint256(0x0fce0505d3be8c6c68ecf25ce305177b7fe909a519e1f67b510b045d54ecda18),
                y: uint256(0x1f5f0d8ea09c635fbc27e46c3c2b121fb90faa52538146856a9f9fd357f1db26)
            }),
            id4: Honk.G1Point({
                x: uint256(0x0a28ef915cc27e1919e69bcf92fa524511a917c343a27eed2c8ae2035b01abe3),
                y: uint256(0x0687fa4d062dbaaab480c0fe76f2559b96fbd9fe62ff167986f9fe55e673e4d2)
            }),
            lagrangeFirst: Honk.G1Point({
                x: uint256(0x0000000000000000000000000000000000000000000000000000000000000001),
                y: uint256(0x0000000000000000000000000000000000000000000000000000000000000002)
            }),
            lagrangeLast: Honk.G1Point({
                x: uint256(0x2ed6a3b223499815a89227050bc92d10c56d4c487469fe1778117a317a37ba4d),
                y: uint256(0x136619e4162f7df511e48b9cf191ac91e15550db414672a7b826b14dc6f8bdf3)
            })
        });
        return vk;
    }
}
