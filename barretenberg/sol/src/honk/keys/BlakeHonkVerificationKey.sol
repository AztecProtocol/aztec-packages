// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.21;

import { Honk } from "../HonkTypes.sol";
uint256 constant N = 32768;
uint256 constant LOG_N = 15;
uint256 constant NUMBER_OF_PUBLIC_INPUTS = 4;
library BlakeHonkVerificationKey {
    function loadVerificationKey() internal pure returns (Honk.VerificationKey memory) {
        Honk.VerificationKey memory vk = Honk.VerificationKey({
            circuitSize: uint256(32768),
            logCircuitSize: uint256(15),
            publicInputsSize: uint256(4),
            ql: Honk.G1Point({ 
               x: uint256(0x2e5f133c25f7e05bd6660196c892121f7fa686cb9a8717a5deea6cd0881e618e),
               y: uint256(0x1189bba9eeea96ba8935052434f4b0a60b0a481e3464dd81dfcd89e23def001b)
            }),
            qr: Honk.G1Point({ 
               x: uint256(0x2a93ffb34002da94f5b156ba5a212ac3616c848bd9c44c9821bbdd64cfd848af),
               y: uint256(0x015699dcc0b28766d45f5ddce8258393e84c40619d26034e76f778460a1e4d89)
            }),
            qo: Honk.G1Point({ 
               x: uint256(0x2057928e8c5eb539c32c3025007b7be1e1663c358f59540c6f949794c274f886),
               y: uint256(0x12bf0b15c3aa92792330f58b04512714c4a902e537fe87cc438293e1805eaabf)
            }),
            q4: Honk.G1Point({ 
               x: uint256(0x304f47a08d4687afa0e2502a9782c32c458bf873ef50c169b732a367e567aaf3),
               y: uint256(0x0bb37044594e7de200408a4db6bc46adf7790b06f17dce6f38b7deed480aa9f0)
            }),
            qm: Honk.G1Point({ 
               x: uint256(0x0aea5b04332ad8781411f7edde21266857ffe11e93af334b14a2b948429afaa4),
               y: uint256(0x2bd2e3884d486b387122effa12e8698daef82e9b99d7d25b7d5df91a9d738495)
            }),
            qc: Honk.G1Point({ 
               x: uint256(0x0e3b418ea1924b4514d5009cd983b5a8074fa95cd1fb200f019fdebe944e4225),
               y: uint256(0x1e6ef5bde7a9727f1c1d07c91461ae1b40524650b35fdd92ac7a129f263b1beb)
            }),
            qArith: Honk.G1Point({ 
               x: uint256(0x096841bfa8ec2295a5af5bf69ec539c31a05b221c84ed1d24c702e31ce1cbc95),
               y: uint256(0x10b14cca7e9ff05fcf1e3084f4fc9ab098cf379864b2e2e2e0d33fc5df9d9a50)
            }),
            qDeltaRange: Honk.G1Point({ 
               x: uint256(0x2d27fd1a30a0ab04a05144c27ac41187d5cf89a6022e47b263d1ccb93b3cbea5),
               y: uint256(0x238eb233e9aebc81285a2647f2598bab00a4367da47b12c2b0476afc2d94ab1d)
            }),
            qElliptic: Honk.G1Point({ 
               x: uint256(0x1c6fc8e14453adf64e6d9643ef9f1fb55e3a307ac1ec84f86cd736fc866e05ab),
               y: uint256(0x1bf8619b1704b99ab8820ed94dd760da2945e8e1c771c0bdeadbe40aa5700cdd)
            }),
            qAux: Honk.G1Point({ 
               x: uint256(0x023fe0703623b99c93358348d76eb620f26ceafa58df018e3a8f1d599a61e76f),
               y: uint256(0x2ceb9c4c4ca12ea769157ef10cde9644f9f0549805e48d5fd5d73a634d2cdcb5)
            }),
            qLookup: Honk.G1Point({ 
               x: uint256(0x1375bbfbf5ed31b38460f46a43ac14e2cda93a3bc5cfd6e8a93cca356694a346),
               y: uint256(0x204c5173892c19a97a04b5f8419898063df5136489809ddb9f7eabb58d6858ab)
            }),
            qPoseidon2External: Honk.G1Point({ 
               x: uint256(0x1fa8529236d7eacdab8dcd8169af30d334be103357577353e9ef08dfda841785),
               y: uint256(0x055251b013746385e921b4620e55ef4f08b4d8afc4dbca7e6c3ca0f1b52c5a2b)
            }),
            qPoseidon2Internal: Honk.G1Point({ 
               x: uint256(0x1515283648ab8622ac6447f1fcf201a598d8df325279bfac9a6564924df97ee5),
               y: uint256(0x0335bb595984ad38686009bca08f5f420e3b4cf888fad5af4a99eca08190a315)
            }),
            s1: Honk.G1Point({ 
               x: uint256(0x26cec5ff3eb1b803c52fa1fefaac7a2be5cd13c1a1cc20bb9f22049c7f8597d2),
               y: uint256(0x07e80e74eb0e06d7c0c9a3fbbdea4e86e5934faa8142625f175320778bcba65f)
            }),
            s2: Honk.G1Point({ 
               x: uint256(0x140b2faaf30cb5fc528621f4a395943e7fab8198dc734ac13253dd249682dd2a),
               y: uint256(0x12709c4a13428f4704d284c90a81cc83280680185ae6298187e86debcd3e00f7)
            }),
            s3: Honk.G1Point({ 
               x: uint256(0x0aca5621e9f49279969497b3da0eb8a74c68c3513f4cf98e8b1d6f88567557a8),
               y: uint256(0x2664811311f75057a16267bc0479eaeea2424156417cc4d3f8bd286fac9aa5d2)
            }),
            s4: Honk.G1Point({ 
               x: uint256(0x04417c606a41393e73113ec3f834883dbeb302889199b888c0f5ea58a008ff98),
               y: uint256(0x0865670de7962d29b6a9012f28ea52113c4e2b55d7de44e829edec87dba1d5c2)
            }),
            t1: Honk.G1Point({ 
               x: uint256(0x1d4e30cc33125c72bc1a31ebff8c7ba5c5b34c2d3db26658f8f7a4c1a8917596),
               y: uint256(0x24b630ad1c505f3a97aa5461310b4a291aa7fa696c1040ecbc0f1d0cab88b1c5)
            }),
            t2: Honk.G1Point({ 
               x: uint256(0x14d7f3319ed85d18dcac134fbc88f55a46cef0e5e7a6d02feb1cbff52cfa6e9d),
               y: uint256(0x2a8f8123f428e35766ee7e966f24ec27a2633400ede745386475dd10c4c17d2a)
            }),
            t3: Honk.G1Point({ 
               x: uint256(0x11061c55e2e00e034fc719cc1c4caa69e1f30657a6bb0967911e2a760efa4a77),
               y: uint256(0x10be7ab8fa1f76943b2cc162dd50e4acd000d9b1ab2a0020abd1267b4b9be410)
            }),
            t4: Honk.G1Point({ 
               x: uint256(0x1154b181349afd6acd7366b4640b40e08dcbebc684265d5308253042542ee558),
               y: uint256(0x08bc724f607bcf3fe89b6ae24fb50290667cb2e8f5c12fb905fc86fbec0e0c18)
            }),
            id1: Honk.G1Point({ 
               x: uint256(0x01c082a85908fea4c69c4e51436fba7d965e1d88e485da16e35d8f4e8af3b8bd),
               y: uint256(0x11b0ada021468b059aa6c27f4d4950ef65b98d4d8808ae21718bd8b90f9bb365)
            }),
            id2: Honk.G1Point({ 
               x: uint256(0x0b8667619755bd09c7970defeae2c920df2b17b41608303ae1d7393615dd04e4),
               y: uint256(0x1c5419cd435c5516ac566a9d1dfecdb4e10190c63f2dbd8a1932785caf022e2c)
            }),
            id3: Honk.G1Point({ 
               x: uint256(0x110aee72793c4b4ede92c1375f058b4170fcf01bf18f8f1ee934f7ae0fa26da5),
               y: uint256(0x15c4f6a01ff04ef6b5225c896dfb7060a7a2c320395bda410e756d6b507b7eb8)
            }),
            id4: Honk.G1Point({ 
               x: uint256(0x2472aba130e7ed2aefad128109415ec2bdeb56e81e3cbeacc93e00c95f203579),
               y: uint256(0x0c867d0f8e2f9c861574383b89020980358d898497f80c198a6c17c2f4daf9a4)
            }),
            lagrangeFirst: Honk.G1Point({ 
               x: uint256(0x0000000000000000000000000000000000000000000000000000000000000001),
               y: uint256(0x0000000000000000000000000000000000000000000000000000000000000002)
            }),
            lagrangeLast: Honk.G1Point({ 
               x: uint256(0x2c3e8add0e69c3bb940ffe92b6d3bdbbe0c8ac0c95866da586d857c73a0556ba),
               y: uint256(0x22ed2a9c8e4ee1ecde6e7285f21cb4fe0a23131c9ee50f22e367f7c8cc2ac84a)
            })
        });
        return vk;
    }
}
