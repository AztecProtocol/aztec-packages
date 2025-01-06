// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.21;

import {Honk} from "../HonkTypes.sol";

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
                x: uint256(0x259ccc124bd4cf494d50c802a2df9671c3a500ccc3e83b72ead3806a7e740675),
                y: uint256(0x0fa82481afabca16ee5f23d7ea094b00ebbc578a716fdaf782e05fd726faf007)
            }),
            qr: Honk.G1Point({
                x: uint256(0x14ff9e75f0777269c7e1788b0c22a4995ee7aa86b57f1df85daad5dc5394c64d),
                y: uint256(0x2459bcedd7bd75b357c9e5feb11de3cd8da023ce6a386b2449cd5f93758a6a3b)
            }),
            qo: Honk.G1Point({
                x: uint256(0x2d45d3ef650bc8242021c0b5c7c458abbe387b5697fd64f82c07527f7d1de8c6),
                y: uint256(0x0267edd43123342fda564babb7c89110ba206a7b36500e88bb7c485448e97913)
            }),
            q4: Honk.G1Point({
                x: uint256(0x1ce127e531187e01b1ce284179977224b8f76fb470da6c61bf1791509a40d8b8),
                y: uint256(0x22bdfdaabf4d8863c4a989a3345c7c9519af302fa6a1f67e4810d6589c2b5d6d)
            }),
            qm: Honk.G1Point({
                x: uint256(0x0951790dc5ec21ff7bd1054fbc6c3024120f848605d10edcabbd81924ef14404),
                y: uint256(0x0715c7ce615280c7629a43891bf15a2194bd659483b15333d6bc66697c59e39e)
            }),
            qc: Honk.G1Point({
                x: uint256(0x021f1c4697f49682d5b22a39cab4b196a822c7279551d3c86de39eecef6ee491),
                y: uint256(0x170cf597b1d291c41d59d76f852fba1a7def57d9d031daf7bb0061b6b45be5b6)
            }),
            qArith: Honk.G1Point({
                x: uint256(0x2ec15ed0cae4827b6c15a424b3409faea5a3b1488234f9970c12fe64dcd09915),
                y: uint256(0x2f78d2844b0fff0faafdd1cd110d85ac77b2f7266dcbadc0e8bc6505f4248292)
            }),
            qDeltaRange: Honk.G1Point({
                x: uint256(0x257905e6e6a095881dbf7de8c3a7dcff8742f161bc6ca50871aba6543e480cb8),
                y: uint256(0x0cac0d52c83175f49f71af8e8bd9d6f943cd3b451b6a6683df582a0e46db170c)
            }),
            qElliptic: Honk.G1Point({
                x: uint256(0x08e2c3e7dcc34da5d0170141b5ed9144c9d7de8976e0e2c81ad74e3b9451f76e),
                y: uint256(0x223e14628c0bb1ecd61b88d322fff7c2c2a572c3b3e16fca14fed906a65482cd)
            }),
            qAux: Honk.G1Point({
                x: uint256(0x1a3a5eb5a02862dc132e23eac87a937d4f9b4d3736b3d1ce2bf2aec5b8761283),
                y: uint256(0x0e608d3de6c0adf6dfba886c110a388fc2059abe6f660caf3f901bd3dbe4d97d)
            }),
            qLookup: Honk.G1Point({
                x: uint256(0x22ef6b48ceec28053e1ec5bc4f0a91ae22d287d86044f15672c167ec1af91d8b),
                y: uint256(0x11b828a2435dfaaa173ec009381bcd95b76c41adee995ac0c716b82879cab160)
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
                x: uint256(0x259bede7c068653c0e2a16bd986e1ca97757315d3b973a494c6ca022cea60447),
                y: uint256(0x2a93cb60e983030c470c044e1f156a25fe5e1941d38f4d8c91594e0eaa8858ae)
            }),
            s2: Honk.G1Point({
                x: uint256(0x11df397e5ad916749343c5be9797f2b6e3c0450714a1d5fa8a3f55ef32586940),
                y: uint256(0x046a6da96359bd452f9f3c3ccc15b9f59c26bab349a02faa1f1d34517282ef6c)
            }),
            s3: Honk.G1Point({
                x: uint256(0x1ed35d2fd753212e17554522ac3d692ae25cb581f54adf02f99a5d6f71969d5d),
                y: uint256(0x08352d3f6a0fb619cfd1a960514fe3394d9018f0388f631df9f5af9fcfd0efbe)
            }),
            s4: Honk.G1Point({
                x: uint256(0x15365aa0c1d6bce15408f45f0251c9472f78297ec2cc5ab508f5c568980a893d),
                y: uint256(0x2385c2920ad544f0be29c68152bc7ae98031aee831ddad561a45a95b31ae6ef5)
            }),
            t1: Honk.G1Point({
                x: uint256(0x25bdb78d4e315a031ab7b6cb0dfdee32d86f4845ef1f837cdafa6c45f9ccae56),
                y: uint256(0x0e68860fb89d3a366d4b7244a172f5a7e79147d8f09d3249b1555df77ef64ac9)
            }),
            t2: Honk.G1Point({
                x: uint256(0x0c0b5c83cfca189b7560979cbb59e4450d970a226e703fa090fc0fba87094c82),
                y: uint256(0x290a615d73d77f18f3a7483bd4f7d9ba22ad1c1e28980012e5bb3c9660b96086)
            }),
            t3: Honk.G1Point({
                x: uint256(0x09d24c7501264da486f4ddbe6fee4a104edbfbcc8b3b7ea185db69c5e1a6c38b),
                y: uint256(0x132e749bb80fdc19494cec612ce529b810d672d471253ffb5ab0ada355163fd3)
            }),
            t4: Honk.G1Point({
                x: uint256(0x044ff357ea1fbf33738fc570145106a3f6acc496c748b0b58f4615e1b0626e10),
                y: uint256(0x2816e550d752b97bd0a5c2ed5369a652088981b3e92e3d6238b0c63b203aa3f4)
            }),
            id1: Honk.G1Point({
                x: uint256(0x2a2b95a34bb20d564d0b1ba33afdfe5ad95a8128ddfd8faec40b7bc2faf642e2),
                y: uint256(0x1355384c7b2deba5fb394e25d297d5f37ccfaacfacd57aac61259bc1e87ea6ed)
            }),
            id2: Honk.G1Point({
                x: uint256(0x279ce3dbe9564e5fd66014fbedb03f538e23b5effe8bf1c3ca394eba651d25fc),
                y: uint256(0x0d130ad41878eba2d8da55ed688de58a3b8edf7b237e4ead56deebd56d11344c)
            }),
            id3: Honk.G1Point({
                x: uint256(0x1f3ca856540e150992ef85a64d5bb2ddc643a53f15dad567e08fc5a61307a2c3),
                y: uint256(0x0f44b87f30b55235f069ad5d06f23915c19bf6194c0e6f54e2a4b41ef357e214)
            }),
            id4: Honk.G1Point({
                x: uint256(0x2b85159a22ab90cb83642950f0240a403dac1dc50a970d1113be0cf8a8b5d63d),
                y: uint256(0x1287b2e8e4ee3f0a9afbf798230ea32388a6e90924f13d7c78d5aed275095c79)
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
