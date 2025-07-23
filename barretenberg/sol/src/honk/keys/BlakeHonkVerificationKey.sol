// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.21;

import {Honk} from "../HonkTypes.sol";

uint256 constant N = 32768;
uint256 constant LOG_N = 15;
uint256 constant NUMBER_OF_PUBLIC_INPUTS = 20;

library BlakeHonkVerificationKey {
    function loadVerificationKey() internal pure returns (Honk.VerificationKey memory) {
        Honk.VerificationKey memory vk = Honk.VerificationKey({
            circuitSize: uint256(32768),
            logCircuitSize: uint256(15),
            publicInputsSize: uint256(20),
            ql: Honk.G1Point({
                x: uint256(0x115e3064ce0d1902d88a45412627d38c449e7258ef578f762a0edc5d94a69f7f),
                y: uint256(0x04d77d850fd9394bbf0627638138579df3e738a90b5df30618acf987c622ca9e)
            }),
            qr: Honk.G1Point({
                x: uint256(0x1eabb58777064b859ef128816b80709b2cd29893dea2ec5c6635f3cfa54d7c49),
                y: uint256(0x0d71eea187e1217b4de428b8f4476b86c6cbd329e0f269523f21d72730b10915)
            }),
            qo: Honk.G1Point({
                x: uint256(0x29548329ae6a8896391ff2cd2f6f2aed9038c696582c3ba1270446e9e44a8abf),
                y: uint256(0x0c2ce08e5b2efd0f37d5b4a3847aa3929bbd4b35d7679742041117e854871be3)
            }),
            q4: Honk.G1Point({
                x: uint256(0x14e9fb0e730d8a131a238c38374cb696bc063273412eb5395a8ff93c034ab78e),
                y: uint256(0x297fcd0647bc4d1476144985e3dcd0bcf97b14f99909dcbd3f17b3c3ca59d0bd)
            }),
            qm: Honk.G1Point({
                x: uint256(0x17d2704cbd9791e90971c99b244f6c56d5983353e7fdb0566af22717fa24595a),
                y: uint256(0x1d8c13d4b7d9761a2829c50b91f23ef06f95377a69faaa3a254e9ca38fbf6156)
            }),
            qc: Honk.G1Point({
                x: uint256(0x2dc3ddd755b14dc838cf9de2646b8ffa12a978c73f2ec514616a6da143098a7e),
                y: uint256(0x01946c68cde5e83f9e8cf4520e0697857b6b8365178ebf410618d377f88c95fa)
            }),
            qLookup: Honk.G1Point({
                x: uint256(0x2f52fd71248e5fb7fcda49e0778edcf84065f4c837dc259c99350f66d2756526),
                y: uint256(0x07f7f722d2341b84f37e028a0993f9ba6eb0539524e258a6666f2149f7edba7e)
            }),
            qArith: Honk.G1Point({
                x: uint256(0x0754a05a7b0ded53c11a90be37ef3cd446156d668e2b2d44587434c6782c9b43),
                y: uint256(0x1ca2f2baee2947949c96d4f01916ef586dfc07bf14cb36da863c7ce5902a743c)
            }),
            qDeltaRange: Honk.G1Point({
                x: uint256(0x1d39e78f3e8378c6efc2883b5a8bc64b4b7738bf64b0e78c2a18336338e6bd43),
                y: uint256(0x1e1bb6035c72725eeb7aa44c8de7edd98e1c2cc5acfc372f0f4ae8b5b1e5412e)
            }),
            qElliptic: Honk.G1Point({
                x: uint256(0x2cbe532bc40df99ee508abb727d66b82d71df3a7053c84261b22a67822fb4669),
                y: uint256(0x1b9f8592c9f0d31d7e31ddf0b1cb7a628dd6b36981326cf26b39ef93ce8a2b3e)
            }),
            qMemory: Honk.G1Point({
                x: uint256(0x1fd64fa2077c2d41c30ef63f03a7a1a88aba8a972d3f916a02c5ed1f0ad4fb45),
                y: uint256(0x1a2966812ee427580b358ec7da35b9031bc1fc48b630d31d82f1c194cc722fa3)
            }),
            qNnf: Honk.G1Point({
                x: uint256(0x1c38c36a5a0bbf31a6cd18776a3288eb786803882a617d08234d03c61c85319f),
                y: uint256(0x24075db77bbe7bba1f88f0ef29b0cbb3428016b41a41f577ce336d5c8bdcca51)
            }),
            qPoseidon2External: Honk.G1Point({
                x: uint256(0x14d780dd1182b550dc9e1e7b8b42a4f129d4777c663fce0a650e4e861c040457),
                y: uint256(0x1f224dc8040f13db95bfa9a5701d9f138362b9d1050bd6289001a0fcf144d3c1)
            }),
            qPoseidon2Internal: Honk.G1Point({
                x: uint256(0x1cbb514cfb3b598c8043ebafe65fdf0b53058a2698881e22f4c54b352c5a6757),
                y: uint256(0x2bdb081ba7e3569d3baf62f0f334e4152a318f8715c19a00deb868ea0d4b18bc)
            }),
            s1: Honk.G1Point({
                x: uint256(0x1a92f5bbf1b2b3f12cff6164e7591f94023e4e0d63dbd379785fd6c81721964a),
                y: uint256(0x25a5429df9f07360bdb66de96f8eadfa2269b6616073feb7e2baad4b6706ad5c)
            }),
            s2: Honk.G1Point({
                x: uint256(0x039a060ac1ffbbf07aaff94c1ed59bb587643ec30992555cc84f29ed3b6124d8),
                y: uint256(0x1e248d7836911a05831ee767153f79e297b04cc1223d2b55f8f2b6c867e47327)
            }),
            s3: Honk.G1Point({
                x: uint256(0x1dd36be97b2165209af51d028bb5c76f95351854716a689a783a802aa4ffcd8f),
                y: uint256(0x125fe1110dd9d95884b80d51e404ca5263614c0cabfc3154819be0d76f6e1430)
            }),
            s4: Honk.G1Point({
                x: uint256(0x1bf99be562f7fbfd9c862c0c3a80c599d7cfe3fa61d4e5c9e56a4f7631240041),
                y: uint256(0x19c677ba1a3fdcd0fa4d1b4988149a99e78ab8e9aecaec05f1052ad4fc2143a8)
            }),
            t1: Honk.G1Point({
                x: uint256(0x2d063c46ff66cce30b90a92ac814ecdb93e8f4881222ee7ce76651bf3ad54e07),
                y: uint256(0x0215718164a2dbf8fc7da2fcf053b162d84e8703001218f0ad90d1f8d7526ba0)
            }),
            t2: Honk.G1Point({
                x: uint256(0x1bdccd1181f8c909975dd24a69fd1c26ed6e513cd237106bacd9ac5e790374f2),
                y: uint256(0x1ba438e74f962c1b769f452da854110d0635d48e4d74d282ad06ae0e2830ac91)
            }),
            t3: Honk.G1Point({
                x: uint256(0x21313b069a809e1ab2df2a959cfd9a407933547daf0af170b0e6851d5f4e1014),
                y: uint256(0x11a24ca630551e13681edd34cb75746b12ee1806cc3c2c7e670f3a1bb4f30a1f)
            }),
            t4: Honk.G1Point({
                x: uint256(0x2a0724cfe33e0ee4b3f81929ef0cd1da5e113987c9aed1534cca51dae3d9bc2d),
                y: uint256(0x26983a78aa5c4f3103c7e6128a32f0fae2779a6f0efb2b60facdd09153d403c9)
            }),
            id1: Honk.G1Point({
                x: uint256(0x15d8f06c2ee23dbe29fbd7b9ee41e2b9c561fc28b40d12e83db2564c3336fbff),
                y: uint256(0x083931c5ab37fb24a9a103def4b47e9b5bbf8c5e473139b4da43dd576a524827)
            }),
            id2: Honk.G1Point({
                x: uint256(0x0eea2c0799940a5ea4676c15c945a901d720c6f5e5e7f1a2b66d58dcdab3b37e),
                y: uint256(0x2595156b407a52da56178a347136a81d3190e817e7424eef9d3b358c124f11e1)
            }),
            id3: Honk.G1Point({
                x: uint256(0x17ae3ce8ce8b87b759e13a89e0e26b332b8109251bd41aac8459d6106c621f1e),
                y: uint256(0x0673ed82b15c0c00a74d0c76afdaa648561bb1ed5025bd1d4a0576f2ea927598)
            }),
            id4: Honk.G1Point({
                x: uint256(0x282e666fc7b32dcd0ad48b5bdbd12005ca6bedf914ff6dae80059d550440c6a4),
                y: uint256(0x2fbe917cacec5d8b69ae034feb6736173bb20a18a376c40757e4a4fdfe04efcc)
            }),
            lagrangeFirst: Honk.G1Point({
                x: uint256(0x0000000000000000000000000000000000000000000000000000000000000001),
                y: uint256(0x0000000000000000000000000000000000000000000000000000000000000002)
            }),
            lagrangeLast: Honk.G1Point({
                x: uint256(0x1fa0f714f18f76b04457920d075f6950ef0aac9229e4e0a41eadfc18c15fbbb7),
                y: uint256(0x05c35e7bcf9c6e02134c3ca8700978cc545142414d10c992f6b97c6ac3442f20)
            })
        });
        return vk;
    }
}
