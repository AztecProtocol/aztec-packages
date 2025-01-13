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
               x: uint256(0x06ddfa4a7b1056d4796b8daae22b22d179be19eab51caf58fdea4425e327bffb),
               y: uint256(0x1adc62a82085ad11e6ab1f246509c85228438a7d23bd2fa6b4d3c46d1c626d2e)
            }),
            s2: Honk.G1Point({ 
               x: uint256(0x000f6099cfd504c40c2c24656c391bfc51c73ce2be781422a4a1b281e540a5a2),
               y: uint256(0x1312647f01ecd83e72b6b055a5c16e58d2ea8ba9fc2d107ff6f57a8096068d52)
            }),
            s3: Honk.G1Point({ 
               x: uint256(0x0d09604e64624e996b39f41a97666ca43c84d0044f9e2ddf2c464346fd1a79ad),
               y: uint256(0x01f25a9671aeee824845248487796bce33d1882d34bd311f2065b90a58585a25)
            }),
            s4: Honk.G1Point({ 
               x: uint256(0x24b7a84a8bca763fa829d74c5648a3086f254ba44617a68c523518141a70a023),
               y: uint256(0x0d722dffa2ba5793f809dcedb8e9607a418f1916252500249488b472f75424a9)
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
               x: uint256(0x1fcf5d681957dbfe3cc83d91afc9f58956a4a743395de96c4dd971858e1128f1),
               y: uint256(0x15cd26a1f339bc2144d4906fc1aa494f9d1f4cf4e5ed93f143b5f48e4ef24434)
            }),
            id2: Honk.G1Point({ 
               x: uint256(0x10856b890427164f8a4c626b232e0430d7da56dc74020993b1c9159081062a0f),
               y: uint256(0x089faa89fe5a8144d88bb2b79a0bc64ef3ca77c6aee6ab195d9054d35f1de1af)
            }),
            id3: Honk.G1Point({ 
               x: uint256(0x0565a613b8cfcc14428b2b41622dd71f7fe993465e049c2951c5e4ff6ebb3219),
               y: uint256(0x129f7fb53ad869c2bbe4a3b71ef37782d715e1c24b1613a90f5abd728cf7d3c5)
            }),
            id4: Honk.G1Point({ 
               x: uint256(0x207b2e1adc325185880e218cd24d85e691fc04b7a3d11420b7b0c6355b3b8ef2),
               y: uint256(0x2087f0e9a1eb5f7ee73dd9ab11193cf4f74a65e29d3797f1a4949382cd723e1f)
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
