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
            qm: Honk.G1Point({
                x: uint256(0x2fb9700846f0022bed3187c1cf0b174090b058b98047194adf282db291debad0),
                y: uint256(0x21ba20033e1857a24868122f7e25328d7062800999361b19364b7c62c5ede0cf)
            }),
            qc: Honk.G1Point({
                x: uint256(0x043c36b4a5721692349176680a658590a9d577c297e5f3d794fec1c880e8f051),
                y: uint256(0x195c49156dbed8ea9891aed6df5feed06ff1f08380677e82fb2f4408a72cf186)
            }),
            ql: Honk.G1Point({
                x: uint256(0x259ccc124bd4cf494d50c802a2df9671c3a500ccc3e83b72ead3806a7e740675),
                y: uint256(0x0fa82481afabca16ee5f23d7ea094b00ebbc578a716fdaf782e05fd726faf007)
            }),
            qr: Honk.G1Point({
                x: uint256(0x0b11c50746a883e4383982e35a1936e9586028f380a1ec4cf7599426774e1f99),
                y: uint256(0x2f79b36de7832b7666fcfc7feaf2bdff224db852fdd3b97bee6092ca8fd22dc2)
            }),
            qo: Honk.G1Point({
                x: uint256(0x2968918f9de631c93d45d84b220efa2ff7bdd7486a29b6ec8ac579a48651f0b8),
                y: uint256(0x1b28988dc794be7111a947861ed773d6145760d0b420657ddf930845b843c197)
            }),
            q4: Honk.G1Point({
                x: uint256(0x1ce127e531187e01b1ce284179977224b8f76fb470da6c61bf1791509a40d8b8),
                y: uint256(0x22bdfdaabf4d8863c4a989a3345c7c9519af302fa6a1f67e4810d6589c2b5d6d)
            }),
            qLookup: Honk.G1Point({
                x: uint256(0x0740cda472d3e453a2fcd60f35d723e695aacb21ba04f9084afc52604b3bcc04),
                y: uint256(0x0fb95f729baccab8238b16fbec6681f1166ad5a551e9b7946999502303819c7f)
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
            qPoseidon2External: Honk.G1Point({
                x: uint256(0x1fa8529236d7eacdab8dcd8169af30d334be103357577353e9ef08dfda841785),
                y: uint256(0x055251b013746385e921b4620e55ef4f08b4d8afc4dbca7e6c3ca0f1b52c5a2b)
            }),
            qPoseidon2Internal: Honk.G1Point({
                x: uint256(0x1515283648ab8622ac6447f1fcf201a598d8df325279bfac9a6564924df97ee5),
                y: uint256(0x0335bb595984ad38686009bca08f5f420e3b4cf888fad5af4a99eca08190a315)
            }),
            s1: Honk.G1Point({
                x: uint256(0x0b8540a7d4b9f68af310a209e665b9b96bc7176a013a1fd3bfa3e51be892b6f3),
                y: uint256(0x222be999ebb657c7008ae403155f35eae26c2bbdb45f53ddf845694e5b33c0ed)
            }),
            s2: Honk.G1Point({
                x: uint256(0x16cbd9680fda4d75023e1cbbc595d4e1a7330f8ef066011a4106893cba22fe06),
                y: uint256(0x241412468b2cdd90d753b3aef54bc693f743f74958b63bf8b9e13b1e73b2b2e0)
            }),
            s3: Honk.G1Point({
                x: uint256(0x13974139784cdfb86fde8cbed23e008b3d1ea8d35ec365247ce1e7fb1ac580e9),
                y: uint256(0x2e98dfa8b653f9c285a746c524df84c5dbf54b962c070ca46fa21c293db5c68a)
            }),
            s4: Honk.G1Point({
                x: uint256(0x25bdfe71582a214364307f91949e89d8b555b8a806d541c5541852565bef3395),
                y: uint256(0x0c1614865cac1586e703758c2ecb801dcfbd83fcd77a760e209b60abad700c42)
            }),
            t1: Honk.G1Point({
                x: uint256(0x2fc548524cb26d07674add2e538f77e84292737995faf9db61da7110dbde4ff5),
                y: uint256(0x02bf9cd9e57b46e1713a23e2430c597c2ec1f500fc61245cad1485fa5e0d411a)
            }),
            t2: Honk.G1Point({
                x: uint256(0x21846645bb6d3785e1b2497d57be8ae0b6fba047cd837960f234ab2f5b693b4b),
                y: uint256(0x2576207b872d79ffaac0c25adc2cf13ce2a26df47324e2efcab94da0dd52589d)
            }),
            t3: Honk.G1Point({
                x: uint256(0x2d66c44ccb0b5e4fa3e99524315370f3496c3af3c3393c9633d15c0bb487b6b9),
                y: uint256(0x2620591fc497ef8b319c5123a91fb60ff96c3f9c983ff2471d30f4ecc73a5a0d)
            }),
            t4: Honk.G1Point({
                x: uint256(0x0b9637a36be3c944d247e8d4d93b3b3ff5e637913415e08b5c7c7b0c5101caaf),
                y: uint256(0x1bbdffbd59b3f1a41ec403bf740e96799428eeff9a6e0ede9b880dc2108c8223)
            }),
            id1: Honk.G1Point({
                x: uint256(0x07450ae8309488b3fd48f09411c02fe478f4dcb4f6525be47a7bd89668c2aeea),
                y: uint256(0x08a082a8eed2aef053393dbb78942f41985be06527c5460f41ce25e2dfdd9ef5)
            }),
            id2: Honk.G1Point({
                x: uint256(0x05987220adaeb7884ff44c4a83b7ae2828bfb6cad038ac363e8d27275da440a7),
                y: uint256(0x1d5c5cde2ea4bb94d69dae858461471e34363fc094812f82dc368e7ba48db44e)
            }),
            id3: Honk.G1Point({
                x: uint256(0x2fc0df7490d5e4bf85beb3b7b0ba23699d1cfe39a3de758fd565f3c0f788842c),
                y: uint256(0x001926cb363c3121a03e5cd867ead2f8736e4597c395a47b43e793cbdec2eb4f)
            }),
            id4: Honk.G1Point({
                x: uint256(0x2608c589e60f7b806917df85cb737165dc8cf408a220dc144db14f85e42ad396),
                y: uint256(0x1090f6af2524f0395c3e7d268d62e80157e09f0d60aaa5529ec0d45054f638c4)
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
