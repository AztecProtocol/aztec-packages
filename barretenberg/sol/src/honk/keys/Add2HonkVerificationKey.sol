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
            qm: Honk.G1Point({
                x: uint256(0x0cf9ec917690b1f3c5f1eeca422fd46fecedb7e285f730f04ffc950e10849b56),
                y: uint256(0x0ba3c142aa26e5287a2c234b10bc87e843be79521006162193eda994ab7115e8)
            }),
            qc: Honk.G1Point({
                x: uint256(0x22cdd25966a6b790032ec0abcb6580bb0c0b16fc0451b1c049e875c591ba0290),
                y: uint256(0x08ee89ab716f9c1a86eb455af26ea22b62b37322d38c4577e58d7afa0e4dec56)
            }),
            ql: Honk.G1Point({
                x: uint256(0x27456b3a666ff24c6452657437518f7b73e854ce6c763732122a3b923bc6797b),
                y: uint256(0x2ecbc0db4ae72d05db96eb72034b26275a33325b05b2dd53c33662369bcdc4e0)
            }),
            qr: Honk.G1Point({
                x: uint256(0x11d6feb82ca1a185806312498f81091e3f9bb74c4b7625b3ae8dd7cea4dc710f),
                y: uint256(0x1649b8452a7577b1e16b23a2d05711c5e55a180853be8aac29fc4aa1d64f7b13)
            }),
            qo: Honk.G1Point({
                x: uint256(0x14dfdc022af1eca2f57e7d7420a9a3282a49254446bf39714d9ede31a2130728),
                y: uint256(0x2b3ff801ccaf5061adb0321ebcc51710ff7b342916e51c1926ab0e6bb652cd44)
            }),
            q4: Honk.G1Point({
                x: uint256(0x1b87b4f288e37e4ff07f6a368177b9765eeccd1017bec74e98859fa3fbf201f3),
                y: uint256(0x1d100498fbe5bd401d2eb9b77f1a887806c8251de6ccab14008a324357e5ddfb)
            }),
            qLookup: Honk.G1Point({
                x: uint256(0x1d64341216e323f076ac53aa06192392677f44b67b6947dd6a0a1490fb32a083),
                y: uint256(0x28d02cea9cc379ace2ae8779011e247ddc4213ef69895a8e634f425844107141)
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
            qPoseidon2External: Honk.G1Point({
                x: uint256(0x0ca0bc4b1cd9eadbbf49eae56a99a4502ef13d965226a634d0981555e4a4da56),
                y: uint256(0x1a8a818e6c61f68cefa329f2fabc95c80ad56a538d852f75eda858ed1a616c74)
            }),
            qPoseidon2Internal: Honk.G1Point({
                x: uint256(0x09dfd2992ac1708f0dd1d28c2ad910d9cf21a1510948580f406bc9416113d620),
                y: uint256(0x205f76eebda12f565c98c775c4e4f3534b5dcc29e57eed899b1a1a880534dcb9)
            }),
            s1: Honk.G1Point({
                x: uint256(0x1ee42e6792a78e6d972f2a5837543b9b633d5171cfba5818490542c8c44bf697),
                y: uint256(0x12b9d322a38926ecb0d5362e2dc0889f3f1b60f424afe68c1725dd33d61c70ca)
            }),
            s2: Honk.G1Point({
                x: uint256(0x09771d3d9a9fd4387a98a4731629007be9e3c4fd2f786dd8ead41aa976f8bd28),
                y: uint256(0x1703a6752c3cbaaf55de7ecb71deef7b8ba5dcafe25c771dedc5a80c45b06121)
            }),
            s3: Honk.G1Point({
                x: uint256(0x0774598ea3282c98b6dd0ff5ae61cf2384c1575181b593bb51e437b3b3ddb7a7),
                y: uint256(0x174770561e38591c022e00530c2ae0fce5743b6259eba4dcba60cfaed46fd0d1)
            }),
            s4: Honk.G1Point({
                x: uint256(0x0bad8aee68642460b84b30e981f86a1a27734580dbe886ba851d85bab1303088),
                y: uint256(0x268fc1bbe998d39d31ab3878f86731bd9c087ebf37d6a4cd3e0d2d42eff776cc)
            }),
            t1: Honk.G1Point({
                x: uint256(0x1bf7da4add7c858eb94b75f2e78fbd89c84f5fa43824a0d5534173872ee099c2),
                y: uint256(0x1b35fa2a35673699ee1cb260d9e6c4be79b26d488c26dc2531194e43c8f747ea)
            }),
            t2: Honk.G1Point({
                x: uint256(0x16bf79791869cec464180d5322eeaaef18fed6dc10c3e64e314c04d85c3faece),
                y: uint256(0x2e2ec6341669b5b975e25e465af5d9e40533d5ac173554df19daed27f66c36ff)
            }),
            t3: Honk.G1Point({
                x: uint256(0x15d6c249e181b368efd3ef2737f00833c9cafbfdb055118b7c45f2f84defa7bd),
                y: uint256(0x169d45dda72090b85c888b40fdd546bbc4db3002b9ec68d3384d08181e54bf10)
            }),
            t4: Honk.G1Point({
                x: uint256(0x159f2541ce446c6d59ea3f06be91ec9f47c9c82f3e4fd10696511efaff4121fa),
                y: uint256(0x15f873b33ec9467e1f0c4fb3a0b59a6fcd6f3480515f1ff5506c48f0c521f00f)
            }),
            id1: Honk.G1Point({
                x: uint256(0x2e286f771211f7466ea24e64484140bd5bcdcc759e88c2f4b2cc2fda221fb9c9),
                y: uint256(0x21b150b35832343dd3988a32e15c404915b0cebfb762e47ad0a7ce18004bac27)
            }),
            id2: Honk.G1Point({
                x: uint256(0x19b6d9ab601b2cecdac9c552eb9ddc17378cac2854e27a5fd6230183d584f0c9),
                y: uint256(0x2f5c61226e06143579dcc1869c6a8cc1b1c87ea091b80cf0c848d279ebc23de8)
            }),
            id3: Honk.G1Point({
                x: uint256(0x1aa22165b655889dcf4c6c693d3c840c87d342b1469f112e58204590497a5d42),
                y: uint256(0x082a1045cdfd4f7abbf565f51f70aab100a0d6e196570ec997b5e1525a220a58)
            }),
            id4: Honk.G1Point({
                x: uint256(0x26c4f2e833efa6045d057de69f4492fdfa11a6876a134967799e6c8a0d41915f),
                y: uint256(0x07e11b7f5b6d537b5838ba8c6ce291b99a9346e83d8a75f57827fd2317fd6c3c)
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
