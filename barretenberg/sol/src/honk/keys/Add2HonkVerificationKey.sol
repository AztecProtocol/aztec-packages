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
                x: uint256(0x1a381262d2dc0ae06ad9a9b5ac16f1f997257a7219a5921a0c0905508174989b),
                y: uint256(0x1a878a8000c10fa1377f4fa9fdef83fc4fa9fedda2536161dc32147405fc22a7)
            }),
            s2: Honk.G1Point({
                x: uint256(0x10b24427cfff3545af88e5ee9615a3d2aaed00a2673ddb52287f1c24d90551c3),
                y: uint256(0x0cf6d3d8c5ce627691b89f51ba7ecfbe5e77cf972c1249134ce1cf86350047d9)
            }),
            s3: Honk.G1Point({
                x: uint256(0x014b56423aa6d8c7e5c2bf538201308e4b915f33262b80f7285dc7ec81612cb2),
                y: uint256(0x114f17ae78a4cc5dea6694aaf454943a9daddcf81e8baf6986fa48bc16a17a55)
            }),
            s4: Honk.G1Point({
                x: uint256(0x2f0af830499e97b9fef4ce15d68553a257d311d455a84edd9191cbdec7294661),
                y: uint256(0x1504661e6d39e647dbbccdefdecea76f650c55e7f5ecfa5565fc204c04f18afc)
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
                x: uint256(0x27a8eb48eb6b61e859bf2bfedea318164d066fe86a792d8d679d5246bdf2cf62),
                y: uint256(0x1d9faaf08b8c91576372835839466c7e90a0d768cb3a49f41f602a5728c9108f)
            }),
            id2: Honk.G1Point({
                x: uint256(0x04a6f7b9877eaa5ae39bc13031af59a4a13c9c17a6788358a4aa2670017273ac),
                y: uint256(0x17d2498a8dc9d84c36008e2c7f80d4cd91ca53e79064a4166d688d7d21623bf8)
            }),
            id3: Honk.G1Point({
                x: uint256(0x16dfa43dce22231fdb946fb826bd95164bedc81eb7ab6b033841eb090e5450c9),
                y: uint256(0x1d34de9ee00b0afd598ce51f4847506a8d9e1fda246f359fe2bc2a68c9faab32)
            }),
            id4: Honk.G1Point({
                x: uint256(0x26b7351976b4911c0fb008b70ed0edb10681b227234000deaf8064ecccdd5d00),
                y: uint256(0x0e3f02f9444912dc14e554a8f0a5d63958fb3e7f8a28043a7b7ac00cb9ab2f3a)
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
