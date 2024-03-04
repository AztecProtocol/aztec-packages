// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.4;

import { HonkTypes } from "../HonkVerifierTypes.sol";
library BlakeHonkVerificationKey {
    function loadVerificationKey() internal pure returns (HonkTypes.VerificationKey memory) {
        HonkTypes.VerificationKey memory vk = HonkTypes.VerificationKey({
            circuitSize: uint256(0x0000000000000000000000000000000000000000000000000000000000008000),
            logCircuitSize: uint256(0x000000000000000000000000000000000000000000000000000000000000000f),
            publicInputsSize: uint256(0x0000000000000000000000000000000000000000000000000000000000000004),
            ql: HonkTypes.G1Point({ 
               x: uint256(0x143acb72a717ff83c97f80ac01d86b56cbd82465bbbc8c9b876665a0d3173adf),
               y: uint256(0x12239f285dbb22565a7d3a3829f8d5797aff80d8b8d9d32efbf038111a68d488)
            }),
            qr: HonkTypes.G1Point({ 
               x: uint256(0x2c7c42aee15537076707b1aaa55eb7fc60a51690f08ff2f326c10b54e1f0c9c3),
               y: uint256(0x1c1c8e7a98012158aa12a28fb7df18216ebd86d9a5bb7bdfd24bb25e72741ff5)
            }),
            qo: HonkTypes.G1Point({ 
               x: uint256(0x0105f1ea6f90a2baebd40b42addd2b188e604dbe9fe70f7f3e8f491b8f4e01ed),
               y: uint256(0x2fb07791352aa5609a32622cc5dc161d6f5ea6a63566993fbcbd00419295e495)
            }),
            q4: HonkTypes.G1Point({ 
               x: uint256(0x0e57187c610362ce137aeb4438ca80300dafab04bc4ea263b858fcaadcb8ea33),
               y: uint256(0x2244eebe1505b1b72cfd7014fedf175f19d1344f77177c988f4a241d32e25736)
            }),
            qm: HonkTypes.G1Point({ 
               x: uint256(0x22aca03dc50f5e37baa60be7da7cd5ed9412ca7795f6e33382847ae1533e7418),
               y: uint256(0x1346362b9891084fda16031ffb8231b67193051df795aa6f1862602f242bc1ed)
            }),
            qc: HonkTypes.G1Point({ 
               x: uint256(0x12daa52ad7b45f2185870193c2cfd37c574ec8e7d428ae79fec62ecab095be87),
               y: uint256(0x2a338bb938e9b541182bc6e97381c97b0127c38fff7e55a2901aef99827eaa28)
            }),
            qArith: HonkTypes.G1Point({ 
               x: uint256(0x22687f9bab52ea391ef8e5bbb73534e733e9af860115910952cda05e2bc850ad),
               y: uint256(0x251e10c202e80d2f828b66f661d1d385352fb71bda52567dbb4d6f6411ba8542)
            }),
            qSort: HonkTypes.G1Point({ 
               x: uint256(0x12cdbbebc27cf3edf86f2b5efd9c87ef53dcf27383d89418ade0490c3ebdbf6c),
               y: uint256(0x1ac8796000760cbd3cdb209f0083c18d2bbbe93cf7bf71e5130ac3fb444fd667)
            }),
            qElliptic: HonkTypes.G1Point({ 
               x: uint256(0x0879c62ca979eadd9f4d8163b2c1deb6195e390165d085b7d1140f9714638d76),
               y: uint256(0x238f3475bd0a5aded23a16253454c53e40784cee772835b90d715c5274607f90)
            }),
            qAux: HonkTypes.G1Point({ 
               x: uint256(0x0879c62ca979eadd9f4d8163b2c1deb6195e390165d085b7d1140f9714638d76),
               y: uint256(0x238f3475bd0a5aded23a16253454c53e40784cee772835b90d715c5274607f90)
            }),
            qLookup: HonkTypes.G1Point({ 
               x: uint256(0x2e50d3e5c2610070ed8dfa201611b5da2237e7c6a100adf0bdceedf02439cfa0),
               y: uint256(0x0763dfada38bf22ca4386b862131e17824726db852f5f90b37c4fdc76a948ec6)
            }),
            s1: HonkTypes.G1Point({ 
               x: uint256(0x185c8c3e3c2efaa63c798ea9f2be7397095ca97cb6704dbd735da39c28f4fe19),
               y: uint256(0x28c10c1927fd8a87a5188b19eb50b7c1a080a52152ddcb6b83262c3dfc763139)
            }),
            s2: HonkTypes.G1Point({ 
               x: uint256(0x1e2ebf33eccab98ca4a925f7837d5f771665943809170f2c7ec7dc5256e66958),
               y: uint256(0x1615a6af71fe630f586e0a943f310e1190e6bdf97dfdc5e7b33f90997993dea9)
            }),
            s3: HonkTypes.G1Point({ 
               x: uint256(0x2c96efa6ced47b1522b5d1598f3529bece5f79efcbfd642803db4f410a64f6e8),
               y: uint256(0x048a2656f07b6e01325d53763dd3496ca25bdb5e48f2ba45f2a53d5d182786b2)
            }),
            s4: HonkTypes.G1Point({ 
               x: uint256(0x1e7e6751adb54906787e2f550c069fad93bbbe23d48f9c1ebcc8116d45d646ce),
               y: uint256(0x1a42217b176b7ca535249721128c0a78543ab84f27f2c8806862bec172ecf33b)
            }),
            t1: HonkTypes.G1Point({ 
               x: uint256(0x1ec1b607634e31421b5047dc99d7674d6505fed978df0f42a3504f9771a8a7fa),
               y: uint256(0x1da802c6dc2fe6cffc6f9ae983080c66690ceee40c181b4d51fdba6c5c360297)
            }),
            t2: HonkTypes.G1Point({ 
               x: uint256(0x1e38a0a482b7174f429a3bef25fb0a7656abc88cfd215b8e8404132601620784),
               y: uint256(0x2e9ea07a995fa6d589e37fba2715f3f1fa338652ddf84d4e2e4f33dccadb9156)
            }),
            t3: HonkTypes.G1Point({ 
               x: uint256(0x211a0833bb3c6f9ae6c94519b6878ed6157c4a080df786a053d9a19796b9a7f8),
               y: uint256(0x1a3a450e1a272aa1fe9f097acf359502ff69df617de4918b37a497def94db2b5)
            }),
            t4: HonkTypes.G1Point({ 
               x: uint256(0x281a984aef14716cd5d8fc2759eb8ea2464909b5c57d97b6bc50e4dad74d92d3),
               y: uint256(0x169160e1505685aabd5bd60e994bac45162c6868235cc4252c8b87d0f12603fd)
            }),
            id1: HonkTypes.G1Point({ 
               x: uint256(0x2a4fa22a2413a24aaa75da20a0d988aa3bd81e5551198a861ec6ad316c5676d0),
               y: uint256(0x092c59ffc35e18506e7073561a9de177e41357bb52773e06a396833d4f71512b)
            }),
            id2: HonkTypes.G1Point({ 
               x: uint256(0x12325573cf48d10efc4a57051a19630f58e40ccb28db028ae4004250871d27a4),
               y: uint256(0x2fe6a50157062ff565ec966d4576d3efd5db52b10e5072f82333e66eb17ed5f3)
            }),
            id3: HonkTypes.G1Point({ 
               x: uint256(0x1d5ba413174ca8040f2addb365cd5886e588fb4eb81f2bacebf3eb4ee80eeff8),
               y: uint256(0x013f90f327638efd7078df68cab1825e556176377d44b6f657570efb4a3d8458)
            }),
            id4: HonkTypes.G1Point({ 
               x: uint256(0x1ed6b7558913e03679da706044267b02ad25821c10d7109528d7ab2a6e14e966),
               y: uint256(0x17a9c133822e91ce8d83473ec1a86aa773a73b59d82baec136b28c73c2f063dc)
            }),
            lagrangeFirst: HonkTypes.G1Point({ 
               x: uint256(0x0000000000000000000000000000000000000000000000000000000000000001),
               y: uint256(0x0000000000000000000000000000000000000000000000000000000000000002)
            }),
            lagrangeLast: HonkTypes.G1Point({ 
               x: uint256(0x13b825e996cc8d600f363dca4481a54d6dd3da85900cd9f0a61fa02600851998),
               y: uint256(0x151cb86205f2dc38a5651840c1a4b4928f3f3c98f77c2abd08336562986dc404)
            })
        });
        return vk;
    }
}
