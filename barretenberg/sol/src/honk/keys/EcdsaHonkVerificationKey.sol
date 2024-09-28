// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.21;

import {Honk} from "../HonkTypes.sol";

uint256 constant N = 65536;
uint256 constant LOG_N = 16;
uint256 constant NUMBER_OF_PUBLIC_INPUTS = 6;

library EcdsaHonkVerificationKey {
    function loadVerificationKey() internal pure returns (Honk.VerificationKey memory) {
        Honk.VerificationKey memory vk = Honk.VerificationKey({
            circuitSize: uint256(65536),
            logCircuitSize: uint256(16),
            publicInputsSize: uint256(6),
            ql: Honk.G1Point({
                x: uint256(0x051ccdb8069f35f4ef85ad098e95681736a7bed10a7bee1b76a506235dc0b579),
                y: uint256(0x05e168c2e4f90231545f5b24c1a84c1419b8798e4235cc2036c9e101e462b71d)
            }),
            qr: Honk.G1Point({
                x: uint256(0x2c99eed1f855cd5152942cc090aabf15308eb00ac549e965eb3e1950479cce58),
                y: uint256(0x170bf8541390153bf5807bc022c9369f99d8bc1fd87922a0627b144fec0414e2)
            }),
            qo: Honk.G1Point({
                x: uint256(0x1594abb7debcf41e3296178eeec941dbb6242ba13f50f4549734657ee5ebb8b1),
                y: uint256(0x262e1469c56c719bdc4eaab93cc95868eed9fea1fa9ded03b46f2c061a341d4f)
            }),
            q4: Honk.G1Point({
                x: uint256(0x16b49bbcd37e15ed89b2f6f5b97d021abe440ba7cbc69904484991fa7e6058a9),
                y: uint256(0x197b14cb5d037642b27ed7cd79b9568e5853ad1e3508453c0ed1f30c1962fd52)
            }),
            qm: Honk.G1Point({
                x: uint256(0x175280d74e116a82ad6ccc34f640a5b3dda74b17372c9a0941d57749e37068a6),
                y: uint256(0x0827b11a78b8a625ba940983effbcf7354aa0388bd472481c0a8a088653b9769)
            }),
            qc: Honk.G1Point({
                x: uint256(0x2a262a7189292da31f3f4a7926c4d9fcae883188aafe9cf3ba2a623f0004a67a),
                y: uint256(0x0d90b8808180521422b90889592111434dd5bbc0e5deb27419c1f5e6d0bf9883)
            }),
            qArith: Honk.G1Point({
                x: uint256(0x2026f95bb8f7b6ed57287e4833e2789cce8ec9a95b829e6a2abbf5d13d681d22),
                y: uint256(0x19cea5af7d9b39a4ad86a0ab52f8a358f7f35236561a50cdf6f2860f0b3426a8)
            }),
            qDeltaRange: Honk.G1Point({
                x: uint256(0x02d0f736b422d74d9aa2ef26deedb67fdd2e798aae001c4292dabd2c5df31249),
                y: uint256(0x0ae6265d6dcc9da8d3b23f088c6fb062c9be10bfa79e9d0463d4a7785ea4a5f9)
            }),
            qElliptic: Honk.G1Point({
                x: uint256(0x0ffa449a9d6e6c6f3e302eb3f16ce9d3d3711b9102ecf0e303ff91f3f9eb25f5),
                y: uint256(0x095ef997439bccdd1234b2431a520823bcfe3e77f50190e66e70e2c51e906193)
            }),
            qAux: Honk.G1Point({
                x: uint256(0x09023d45c436e756762d8b3527cfcb3f694cdbafd192ccae59210740bdf03ad3),
                y: uint256(0x020c9b591603814f1815038e25d1bb3fb85261bf699abfc8921f48954f0bc2b0)
            }),
            qLookup: Honk.G1Point({
                x: uint256(0x08c0d34ca72136661975f3b1ad658bfda38661b9ff320b60e2974496e03fd62e),
                y: uint256(0x236caf48f4c3a7ca207f5c0ec75f304657e49780015cf40ff9be37f8ba3c6624)
            }),
            qPoseidon2External: Honk.G1Point({
                x: uint256(0x09d58ddd055d3d65b4f36a347c18c11956b7d43c4f15434ded62bdf1224ff37d),
                y: uint256(0x3002f0782d68214149ae47ee94771a6509709499ca06a8421eeeae97ea37e2a9)
            }),
            qPoseidon2Internal: Honk.G1Point({
                x: uint256(0x1d11dbf6b2ced628ad64ea9d8afef60b6ea2e246160b6525915eb0ab7bdc94aa),
                y: uint256(0x1ecef8438441a2565ee641757bdc6739da7389d913453eee0aaac561fb08495c)
            }),
            s1: Honk.G1Point({
                x: uint256(0x105eb99bfd557812572f2a5ec5b6eff27375b4ed5ce4e7a9649fe3038cfacbac),
                y: uint256(0x1efd910252f319f9c0dc21c7688b92d80fd0a8636f152e0d9c8e0afb5c9a6d2e)
            }),
            s2: Honk.G1Point({
                x: uint256(0x2bbbf5e8a2f7feb08ee64585bf3da54db0da09b211f726adda93020a2ae23e56),
                y: uint256(0x2a9e8e1c3850c66da60224163dc4846ea6f37ed48f9d6dfd40b450fa61081484)
            }),
            s3: Honk.G1Point({
                x: uint256(0x0d264ba46f4a7bafd0ba9d9f9f4827109e1da2cfdb11835b9fc65aaafe9f9f20),
                y: uint256(0x0f9ff6e122bcacd091ffd98d8caf249ab216e9c784e667475e2184ed34892272)
            }),
            s4: Honk.G1Point({
                x: uint256(0x2556809f13dc85764a5e4ea8fda1bbba54f36dad477124915fc8c198db16f496),
                y: uint256(0x27461805fb3a7ee919331973984491c36cc83eee61d3664d5319922902327750)
            }),
            t1: Honk.G1Point({
                x: uint256(0x1ddc9ef86584375e5998d9f6fc16a4e646dc315ab86b477abc2f18a723dc24f6),
                y: uint256(0x03a3b132ca6590c4ffdf35e1acd932da680a4247a55c88dd2284af78cb047906)
            }),
            t2: Honk.G1Point({
                x: uint256(0x1e4cde3e410660193bacdf1db498ffb6bf1618c4d7b355415858d7d996e8bd03),
                y: uint256(0x18d7f0300f961521ead0cb3c81a2a43a2dea0fdcb17bd772aef6c7b908be4273)
            }),
            t3: Honk.G1Point({
                x: uint256(0x0e77f28b07af551fea1ad81b304fd41013850e8b3539309c20bb2fa115289642),
                y: uint256(0x15f92fde2f0d7a77c27daeb397336220ffc07b99f710980253e84f8ae94afd4d)
            }),
            t4: Honk.G1Point({
                x: uint256(0x2285ea4116ca00b673b2daadf596052b6d9ba6d231a4bea8af5a3c0f28c44aa4),
                y: uint256(0x076bf1e1f682badebfca083e25d808e8dae96372631c0721a7ee238c333a862a)
            }),
            id1: Honk.G1Point({
                x: uint256(0x0b034b231d25a2e152b830397a59c97e02175212a6c5ce00129625cfb2e5c53d),
                y: uint256(0x22e1842515d4569ca06477f4b2685d0a767bfa1eecca343c889840af8c086db9)
            }),
            id2: Honk.G1Point({
                x: uint256(0x0e82a73cd55280503e70d5bdd855071d202ff65f31a65996955a7661775ff290),
                y: uint256(0x1325a665dfee8e1247f3129ca943e12736f800afc1a9dcfa0476050b8e3c87f8)
            }),
            id3: Honk.G1Point({
                x: uint256(0x2ad12a1238e051fba16108022b5e58bba1fc7966fe759016a93fae5397e8c403),
                y: uint256(0x257cfc281b0135bb8dfb0df6a7b69ca39835af544007eb61ace84ce7014c1fea)
            }),
            id4: Honk.G1Point({
                x: uint256(0x058bf4de2f71f4d2e11235d140d05db461fb50d8aef64c8c52e2c0f57438dcce),
                y: uint256(0x1e90ce7ec8cca2e65d7deafb655e6c7b0c4b964cd2cb1e5b4ef5ad78ab2f4b46)
            }),
            lagrangeFirst: Honk.G1Point({
                x: uint256(0x0000000000000000000000000000000000000000000000000000000000000001),
                y: uint256(0x0000000000000000000000000000000000000000000000000000000000000002)
            }),
            lagrangeLast: Honk.G1Point({
                x: uint256(0x28bf8c9eeae6946902ee08351768a3e4f67d812e6465f55f16bf69fad16cf46d),
                y: uint256(0x12dab1c326b33ea63ec6651324077c0ea2cb0ddfafd63fb8f9fbcc70bd53d7e0)
            })
        });
        return vk;
    }
}
