// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.21;

import {Honk} from "../HonkTypes.sol";

uint256 constant N = 32;
uint256 constant LOG_N = 5;
uint256 constant NUMBER_OF_PUBLIC_INPUTS = 3;

library Add2HonkVerificationKey {
    function loadVerificationKey() internal pure returns (Honk.VerificationKey memory) {
        Honk.VerificationKey memory vk = Honk.VerificationKey({
            circuitSize: uint256(32),
            logCircuitSize: uint256(5),
            publicInputsSize: uint256(3),
            ql: Honk.G1Point({
                x: uint256(0x27456b3a666ff24c6452657437518f7b73e854ce6c763732122a3b923bc6797b),
                y: uint256(0x2ecbc0db4ae72d05db96eb72034b26275a33325b05b2dd53c33662369bcdc4e0)
            }),
            qr: Honk.G1Point({
                x: uint256(0x274db2ddab5fc87804dcb835027d293547d5fc2b6cde27990e5577a3d77aa4b0),
                y: uint256(0x29d2c716e45fccb7b1d8a3fb384854408392a74a4e4fb4d3cfab460efbfdb87d)
            }),
            qo: Honk.G1Point({
                x: uint256(0x26da077296ea89f2b0caef070f7c380bedee8f4137d8e15972888cb873b6a849),
                y: uint256(0x01028d4966e7b172aca7f9c56d169a449b2326bc0293d54f3708482a8fd09d26)
            }),
            q4: Honk.G1Point({
                x: uint256(0x1b87b4f288e37e4ff07f6a368177b9765eeccd1017bec74e98859fa3fbf201f3),
                y: uint256(0x1d100498fbe5bd401d2eb9b77f1a887806c8251de6ccab14008a324357e5ddfb)
            }),
            qm: Honk.G1Point({
                x: uint256(0x12dda3f2df2c6774290c833772e87ec75c9a658559506fcd1d743e0e98b6e0ad),
                y: uint256(0x2df9dc1c291b41624c0ae46e40238467771572731402b64d664ed641c5078105)
            }),
            qc: Honk.G1Point({
                x: uint256(0x0963fc084e9f28db0ad8f6d9cc0fd9dfdf2704140bb42debece9b98ed4e6915b),
                y: uint256(0x1e81fc7c58c0d8ae1233acb9d57c1d69a82c4c1a418494558b735fba505f6877)
            }),
            qArith: Honk.G1Point({
                x: uint256(0x06d4ca88fe948f6b5f555d318feea69879457f1cf2b22f7d464fa8d4a8b5cd46),
                y: uint256(0x155440972055e3134a5b514eccdd47b0cc217ff529b603700339d647b7e338d3)
            }),
            qDeltaRange: Honk.G1Point({
                x: uint256(0x1bd6129f9646aa21af0d77e7b1cc9794e611b5d59a27773f744710b476fbd30f),
                y: uint256(0x2f8d492d76a22b6834f0b88e2d4096139a9d1593d56e65e710b2f344756b721e)
            }),
            qElliptic: Honk.G1Point({
                x: uint256(0x056ab50282da428d93b17cbd1c81267dcebcfbabdedb47b2d715b5baa6520bff),
                y: uint256(0x10b4e7bd9d6d91a57b0695be166ffd27cbeee602bcb5a9ed32c8d9440912cb72)
            }),
            qAux: Honk.G1Point({
                x: uint256(0x024236bda126650fb5228cf424a0878775499e69e8bd2c39af33bd5fa0b4079a),
                y: uint256(0x233cda9292be02cfa2da9d0fc7b0eab0eb1a867b06854066589b967455259b32)
            }),
            qLookup: Honk.G1Point({
                x: uint256(0x2594d00a131b347f472a021eac09e25eacba35749a9ba8f8c7f4a726ff63a910),
                y: uint256(0x2499be5abe1cf5463534a1d0613f82449f1989f1186f2d0b67295bda7f8a0f55)
            }),
            qPoseidon2External: Honk.G1Point({
                x: uint256(0x0ca0bc4b1cd9eadbbf49eae56a99a4502ef13d965226a634d0981555e4a4da56),
                y: uint256(0x1a8a818e6c61f68cefa329f2fabc95c80ad56a538d852f75eda858ed1a616c74)
            }),
            qPoseidon2Internal: Honk.G1Point({
                x: uint256(0x09dfd2992ac1708f0dd1d28c2ad910d9cf21a1510948580f406bc9416113d620),
                y: uint256(0x205f76eebda12f565c98c775c4e4f3534b5dcc29e57eed899b1a1a880534dcb9)
            }),
            s1: Honk.G1Point({
                x: uint256(0x2183ad847a1249f41cbd3a87f40c2f430eec8e15078ebf4294072495293f623a),
                y: uint256(0x18f03d44febf5942b0325bd60625eb1d407adb20bdc51e770aa1f4ca1daf767c)
            }),
            s2: Honk.G1Point({
                x: uint256(0x2d6764e48b62f11fa745090dbc582712f8a0a16ef81cc7da6fba8b1ec52d23a1),
                y: uint256(0x0289e7980be1c71d3e91a117b1d062b27bf4d711e9ab3a8ee82a64eaf4c5ac45)
            }),
            s3: Honk.G1Point({
                x: uint256(0x16e299d4076387afc2add98ca386b3ff7ef29b7e87bb492a02e820b6404da3de),
                y: uint256(0x2b11799049c80302774a11e05c57c8f614aecbc1c9a524e48328466195f35eaf)
            }),
            s4: Honk.G1Point({
                x: uint256(0x27c8607e808c4a94be60e9fa6e4263ab2d4b41bd866add287affd942f5879b79),
                y: uint256(0x25584de7b2b270f792e86e4ca403dc6fbf31f16b1da4d3f95ed9b8231e1a7e31)
            }),
            t1: Honk.G1Point({
                x: uint256(0x1fb7c5d789d32e42a08e41296286139f603c7607ce186d0cce6e472dfe021473),
                y: uint256(0x09d80a7c25410f51739aadc54ad122874e4551efc35bd23807ecf23a79ef418a)
            }),
            t2: Honk.G1Point({
                x: uint256(0x108788a192d4d3c38e445629bb550acf212f9b2049b6fb1cc76900bd482fb5b0),
                y: uint256(0x195266ac0788c227762333892ad282a4679450ae72e8e8b4a1ead0e63d4f4e04)
            }),
            t3: Honk.G1Point({
                x: uint256(0x1eb529bdb867a986cca8b8c0119e679b5712f4503e5d00698de6b6ae49092404),
                y: uint256(0x20886f9e098437ea65110f5591661e37ac720779a376a6155f132dcd6c301a52)
            }),
            t4: Honk.G1Point({
                x: uint256(0x1a552bd8d3265d1f23e7ff166cf20fffa5c0688c867cfd3a2ea65452d8ad60a4),
                y: uint256(0x1cb1414f7b9f8edb7c7a0d61f66e24e632a4050d9b3be0d6c35109aa99693039)
            }),
            id1: Honk.G1Point({
                x: uint256(0x2e286f771211f7466ea24e64484140bd5bcdcc759e88c2f4b2cc2fda221fb9c9),
                y: uint256(0x21b150b35832343dd3988a32e15c404915b0cebfb762e47ad0a7ce18004bac27)
            }),
            id2: Honk.G1Point({
                x: uint256(0x18eff4656b9f83aaf418fb251334d580bc6d247b19bb2438d4c4e71ffc3db1df),
                y: uint256(0x1f859be892b830da65325a465f711a12a0b777997bbbfa5baebcb9f9a0eae3f1)
            }),
            id3: Honk.G1Point({
                x: uint256(0x0a0ae72496a2b188d803fb33078c15cbd3d6874f3d1dd71eeb6ff7d8f4542ed5),
                y: uint256(0x15314a39e87cc4d8274dc773f73f20ec712c0fc7216fc00b016fadca84dbf785)
            }),
            id4: Honk.G1Point({
                x: uint256(0x2493c99a3d068b03f8f2b8d28b57cea3ee22dd60456277b86c32a18982dcb185),
                y: uint256(0x1ded39c4c8366469843cd63f09ecacf6c3731486320082c20ec71bbdc92196c1)
            }),
            lagrangeFirst: Honk.G1Point({
                x: uint256(0x0000000000000000000000000000000000000000000000000000000000000001),
                y: uint256(0x0000000000000000000000000000000000000000000000000000000000000002)
            }),
            lagrangeLast: Honk.G1Point({
                x: uint256(0x2d855b5b9eda31247e5c717ce51db5b7b0f74ed8027eddb28bb72f061415e49e),
                y: uint256(0x1e857d997cc8bd0b6558b670690358ad63520266c81078227f33651c341b7704)
            })
        });
        return vk;
    }
}
