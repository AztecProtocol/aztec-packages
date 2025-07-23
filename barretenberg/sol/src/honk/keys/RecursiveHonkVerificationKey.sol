// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.21;

import { Honk } from "../HonkTypes.sol";
uint256 constant N = 1048576;
uint256 constant LOG_N = 20;
uint256 constant NUMBER_OF_PUBLIC_INPUTS = 16;
library RecursiveHonkVerificationKey {
    function loadVerificationKey() internal pure returns (Honk.VerificationKey memory) {
        Honk.VerificationKey memory vk = Honk.VerificationKey({
            circuitSize: uint256(1048576),
            logCircuitSize: uint256(20),
            publicInputsSize: uint256(16),
            ql: Honk.G1Point({ 
               x: uint256(0x258a6cd06ba6341369dcf745bc4969ec48b49adfa258f0917e5e0c0dd5335219),
               y: uint256(0x23186919e9fbba808a495a77b2b738b4f180d069bda07fee4d2adaceefafe793)
            }),
            qr: Honk.G1Point({ 
               x: uint256(0x1a5278b77e0c99c6ebcc60b876a0d5a25e721be1ba2b21f829c6d76fcc166547),
               y: uint256(0x0542136e40eab6b01d07a0f86220caa5d37420fe882f3fc384ad5e62462d6f82)
            }),
            qo: Honk.G1Point({ 
               x: uint256(0x1eadd95154cd05717a74d03e9caa9a40c971e8084fe72ec04524d8889208f974),
               y: uint256(0x0d29254be2522a0784f9b01fd54c0dc2fd40ad334adc9da61cc2d6b4a5c36f36)
            }),
            q4: Honk.G1Point({ 
               x: uint256(0x1b588cab342e9240beae026164694c796cba0c5a571c48dca581f0c164c1d554),
               y: uint256(0x2b294f5484b32109b0fc15820c2af119be0ed7c5f7f1b2b68f49daa68ef94be4)
            }),
            qm: Honk.G1Point({ 
               x: uint256(0x2aa8b85debcc957d7ff50ee1422cb512824d95980fd02d9b982f2adb6c99e28d),
               y: uint256(0x12d0192ae9eaf0fc4144c939fe3246f7d120f605b6b1ea8b501051297261678e)
            }),
            qc: Honk.G1Point({ 
               x: uint256(0x13a21ba3cb7c885e6a99175c56d54ab02434e1dc63eb55137cab86dcf70fefa6),
               y: uint256(0x11cbf255983b822577b3a438d16c10b2afeee92855277f3f4d955655720d7d75)
            }),
            qLookup: Honk.G1Point({ 
               x: uint256(0x17c6d9d50e48678a2ac344538de4c7ece661d9ddf8d6ce71e63ee377b120f70f),
               y: uint256(0x19c51b736e4c5a7d8380246160d19aad54bcdd8f21bebc775e9dfb36b9a73d45)
            }),
            qArith: Honk.G1Point({ 
               x: uint256(0x2308ff3accfb86a47762831fce9e49512ea99455bac9c407610c504f66487673),
               y: uint256(0x05c629e2dbda3a24bcd1271bf08c171c7d6f58a82b37576087e2f6c35c43d073)
            }),
            qDeltaRange: Honk.G1Point({ 
               x: uint256(0x11ae7b1d262c6ff4ce6b321aa21669e499a42702cf5fffa1cccb393103688aab),
               y: uint256(0x0721995e07c646c791fbbd16916d71c973bb7f92475a004b9f71cb5077097eea)
            }),
            qElliptic: Honk.G1Point({ 
               x: uint256(0x0f60df2c2c7d2ba662120d5c424bc68cb54832a22d6e70854a2b3a713c61affa),
               y: uint256(0x1c9132b7fd46dbe9af5a5a3965dfa1be19578d3a67602315a380794a49b2ee6f)
            }),
            qMemory: Honk.G1Point({ 
               x: uint256(0x2d436567a5b31e1c8c965a12d582c5ef49d3210ba36b58e673b0eb9c08431cef),
               y: uint256(0x114d5f6b308da7db6df4eac3d48d23c883e3a6412aa568b9e848db1f82f15405)
            }),
            qNnf: Honk.G1Point({ 
               x: uint256(0x269894b7bb5749612a5fef72b083a07d78d6223e0a12d295ccbc025fc212d7d6),
               y: uint256(0x0b4758c69ab6329af9dfcc8b9c23e04cedb5f72f6d726229056f302acb8d1b9b)
            }),
            qPoseidon2External: Honk.G1Point({ 
               x: uint256(0x1822bd9642b80647402c0df1bc2286c9fc710c411373e7d74d565df855f9b772),
               y: uint256(0x2f683461e955df39994859ce90396529d0666852afa6fab5da58ba9de81abfc2)
            }),
            qPoseidon2Internal: Honk.G1Point({ 
               x: uint256(0x151e2c624290aa4660f9989ba3b0d85645a5536988841b74c5afc37cb0568d1f),
               y: uint256(0x2497cdd91730d4d673074f42fe6e8acc08feb8c4bbab22132c467885206c2aa2)
            }),
            s1: Honk.G1Point({ 
               x: uint256(0x14a50d51f6b3ad76d59f47654e374df064936091d0b79d10bb325b3c4434cd05),
               y: uint256(0x160e4e2067ab60ad48ddf39be1bcdf21f23028c42659112d891317764da8815e)
            }),
            s2: Honk.G1Point({ 
               x: uint256(0x04022fc58878b5a1f73cfb2eb17e76222897d7f1441009bf10722e8c95939015),
               y: uint256(0x0b90dbbfa0c156d778b2e2cd3bbbddc4947b2bbe5e5a63a2ce22ffe466e6bd7e)
            }),
            s3: Honk.G1Point({ 
               x: uint256(0x20c3e5e91f423fc7e86c1d6724dc64bb7112a2f871e4a8f3f87380559b91392b),
               y: uint256(0x0730ddf15578f9d52baaa77e5c16034b508d5f2a2047a184c6b829cd7ecef686)
            }),
            s4: Honk.G1Point({ 
               x: uint256(0x06ecd4fec42970fe67004cd12d0ff71e176089c4d70e4a5b94f5be3cd884f4a8),
               y: uint256(0x188ef8c399af1ca3bd793b3647e1e4c3851a3b749661b3f985f4df26d54c358d)
            }),
            t1: Honk.G1Point({ 
               x: uint256(0x1f1156b93b4396e0dac3bd312fdc94243cf3e0cfba606d27d5999f4927ff92b3),
               y: uint256(0x116a7935196d39ea9178a285c53a6b419d9961d76a65ed28914ca5cc3ffd2433)
            }),
            t2: Honk.G1Point({ 
               x: uint256(0x23aebc5efc1d0e6d03030b242308fdf369409c76a0245d4f389193b554c30065),
               y: uint256(0x19f38f8e7cf18f375d75db06fca92a0cbfc1214af084c189478e34dc04c77419)
            }),
            t3: Honk.G1Point({ 
               x: uint256(0x15642d62fc17d119ba4afb77ab424e0a771b5bbb501c75790a1a4e2906931045),
               y: uint256(0x21cea98314ec6efc5f8f1f648f42a7a5c1396036397af54a729801cc1c37d4e2)
            }),
            t4: Honk.G1Point({ 
               x: uint256(0x1f3bd0ebf0709ac30745d0dafb183cdd5b4a42e59fe1e447cad24659049d13a7),
               y: uint256(0x05900180ddd1cec6e340c70c9bff6f16c2efd51d298fee5fce4355fc26890195)
            }),
            id1: Honk.G1Point({ 
               x: uint256(0x087b2a58599fb541eced96c08bd0a7941d4c9efd1b56e6de0438d68a7dd51a9a),
               y: uint256(0x07fb87d585667fed308d48485da327f48d5397566a7aedc9934d455d1aff3a7e)
            }),
            id2: Honk.G1Point({ 
               x: uint256(0x1d1999c6fed0aef328f938ac3d5dc133f65195c39baf5e1027192dfc2e280d74),
               y: uint256(0x0858aa4f4a5b6148f38c1303ffaae740dba399c474e48d6bc0176908923531b3)
            }),
            id3: Honk.G1Point({ 
               x: uint256(0x06ef03b4bd4b616b045097522b2baaa31bf514209e0e8c0919e7936f2a647d9a),
               y: uint256(0x1f6564f6a623f81904cdfdb2e39aea157e14b4069b1ada77a4c2a27588c82299)
            }),
            id4: Honk.G1Point({ 
               x: uint256(0x1e2da0b96b17beef4ad04f6c7723e93ca4666a7bbf0a2fa136d9f46fc28dffbc),
               y: uint256(0x12b4a1e7b6d8e47ea0d977f1e0d01a1def5dc7371c3bb4140f076d1caeb4d848)
            }),
            lagrangeFirst: Honk.G1Point({ 
               x: uint256(0x0000000000000000000000000000000000000000000000000000000000000001),
               y: uint256(0x0000000000000000000000000000000000000000000000000000000000000002)
            }),
            lagrangeLast: Honk.G1Point({ 
               x: uint256(0x11b32c19a7bfed6fafc37070f37304aa6ed4d08a35a63018e794f548b2f357a3),
               y: uint256(0x2f06f34e105109c6d23e330b675afbf135b861d3263be0984c60eaa65c34c646)
            })
        });
        return vk;
    }
}
