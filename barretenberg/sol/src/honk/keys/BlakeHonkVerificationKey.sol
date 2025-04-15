// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.21;

import {Honk} from "../HonkTypes.sol";

uint256 constant N = 32768;
uint256 constant LOG_N = 15;
uint256 constant NUMBER_OF_PUBLIC_INPUTS = 20;

library BlakeHonkVerificationKey {
    function loadVerificationKey() internal pure returns (Honk.VerificationKey memory) {
        Honk.VerificationKey memory vk = Honk.VerificationKey({
            circuitSize: uint256(32768),
            logCircuitSize: uint256(15),
            publicInputsSize: uint256(20),
            ql: Honk.G1Point({
                x: uint256(0x115e3064ce0d1902d88a45412627d38c449e7258ef578f762a0edc5d94a69f7f),
                y: uint256(0x04d77d850fd9394bbf0627638138579df3e738a90b5df30618acf987c622ca9e)
            }),
            qr: Honk.G1Point({
                x: uint256(0x1eabb58777064b859ef128816b80709b2cd29893dea2ec5c6635f3cfa54d7c49),
                y: uint256(0x0d71eea187e1217b4de428b8f4476b86c6cbd329e0f269523f21d72730b10915)
            }),
            qo: Honk.G1Point({
                x: uint256(0x18a4d5e2f02048d39880c46698c9f2dbacc17bb85afe09cf6bc5e5937de3070c),
                y: uint256(0x00d9c34933a6b7489e085430107e19c9b0d3838cc8e7ad9690c67eb8f1f61d39)
            }),
            q4: Honk.G1Point({
                x: uint256(0x0939df76172d60df8619459591c4988be2c040b89ac1169fc5fac7b42798d783),
                y: uint256(0x10011e73c0fd0863f50c59863df5014ba9aec1a6a562db6ea5cc71e4d91afb10)
            }),
            qm: Honk.G1Point({
                x: uint256(0x1ea0204fa1dfd03dc76c7b29af453df4dd44206c1238b21fe0bc82aa9c4f83a3),
                y: uint256(0x198fbb3c1e1b819b6131bd610b5951d55c61a9482207a920b85ec810b44c9604)
            }),
            qc: Honk.G1Point({
                x: uint256(0x2dc3ddd755b14dc838cf9de2646b8ffa12a978c73f2ec514616a6da143098a7e),
                y: uint256(0x01946c68cde5e83f9e8cf4520e0697857b6b8365178ebf410618d377f88c95fa)
            }),
            qArith: Honk.G1Point({
                x: uint256(0x0754a05a7b0ded53c11a90be37ef3cd446156d668e2b2d44587434c6782c9b43),
                y: uint256(0x1ca2f2baee2947949c96d4f01916ef586dfc07bf14cb36da863c7ce5902a743c)
            }),
            qDeltaRange: Honk.G1Point({
                x: uint256(0x1d39e78f3e8378c6efc2883b5a8bc64b4b7738bf64b0e78c2a18336338e6bd43),
                y: uint256(0x1e1bb6035c72725eeb7aa44c8de7edd98e1c2cc5acfc372f0f4ae8b5b1e5412e)
            }),
            qElliptic: Honk.G1Point({
                x: uint256(0x2cbe532bc40df99ee508abb727d66b82d71df3a7053c84261b22a67822fb4669),
                y: uint256(0x1b9f8592c9f0d31d7e31ddf0b1cb7a628dd6b36981326cf26b39ef93ce8a2b3e)
            }),
            qAux: Honk.G1Point({
                x: uint256(0x09334fbfb06d65ac1e96591f4d240ef044367d444223342c442df4072f372f02),
                y: uint256(0x2c112fc650083c2cce5fff4c60dfd3046d83063a8487380e19faef177125fdde)
            }),
            qLookup: Honk.G1Point({
                x: uint256(0x2f52fd71248e5fb7fcda49e0778edcf84065f4c837dc259c99350f66d2756526),
                y: uint256(0x07f7f722d2341b84f37e028a0993f9ba6eb0539524e258a6666f2149f7edba7e)
            }),
            qPoseidon2External: Honk.G1Point({
                x: uint256(0x0255991ffa6154ef35ac35226a51cd69a1d5a7aae7cf2d58294e8b446abcd609),
                y: uint256(0x0908b9ecc3d57b74c222268138c0d8205342e6aaaeb631a5001b64519f9195e2)
            }),
            qPoseidon2Internal: Honk.G1Point({
                x: uint256(0x14d780dd1182b550dc9e1e7b8b42a4f129d4777c663fce0a650e4e861c040457),
                y: uint256(0x1f224dc8040f13db95bfa9a5701d9f138362b9d1050bd6289001a0fcf144d3c1)
            }),
            s1: Honk.G1Point({
                x: uint256(0x265933d8e907e2ed4e379a4e2b51ed6e4284ea7edeb23d8cf0b04f0110849472),
                y: uint256(0x2713d51753ccc918db8bc11011d7d35ae52cd66c3867d74fa81e12effc772262)
            }),
            s2: Honk.G1Point({
                x: uint256(0x041bb070dbfd243a1c648804cc63cb224923caf54a897b8344e34297163c0011),
                y: uint256(0x10870cff36d0f31118cfed58df2da00923c7f53797d0d31a3ad9c229405b7401)
            }),
            s3: Honk.G1Point({
                x: uint256(0x165d13860c8bba49d859124352c27793075dc6f3356a7e98a72d03ef1139399f),
                y: uint256(0x2eaca55d91caec223f841e243c09d70fa11d145ceb825507c5455bab280a5d2e)
            }),
            s4: Honk.G1Point({
                x: uint256(0x2592f1a21a8fce21312342077dbc0ceebfa83b15d22cadf94de883f4fe000e44),
                y: uint256(0x0260addaf4ec113430f54f75091c91bdce1f2e0e1205bfc6a140991729303982)
            }),
            t1: Honk.G1Point({
                x: uint256(0x2d063c46ff66cce30b90a92ac814ecdb93e8f4881222ee7ce76651bf3ad54e07),
                y: uint256(0x0215718164a2dbf8fc7da2fcf053b162d84e8703001218f0ad90d1f8d7526ba0)
            }),
            t2: Honk.G1Point({
                x: uint256(0x1bdccd1181f8c909975dd24a69fd1c26ed6e513cd237106bacd9ac5e790374f2),
                y: uint256(0x1ba438e74f962c1b769f452da854110d0635d48e4d74d282ad06ae0e2830ac91)
            }),
            t3: Honk.G1Point({
                x: uint256(0x21313b069a809e1ab2df2a959cfd9a407933547daf0af170b0e6851d5f4e1014),
                y: uint256(0x11a24ca630551e13681edd34cb75746b12ee1806cc3c2c7e670f3a1bb4f30a1f)
            }),
            t4: Honk.G1Point({
                x: uint256(0x2a0724cfe33e0ee4b3f81929ef0cd1da5e113987c9aed1534cca51dae3d9bc2d),
                y: uint256(0x26983a78aa5c4f3103c7e6128a32f0fae2779a6f0efb2b60facdd09153d403c9)
            }),
            id1: Honk.G1Point({
                x: uint256(0x108a388fa302e6a432528ac33f9ce65e4bf4a306dfa533e44116c9461cb4d407),
                y: uint256(0x1f7dcfd47f7897e447a5e123fa59098b5dcdc2dd1d3eb8ffc1af1aaec6c251d2)
            }),
            id2: Honk.G1Point({
                x: uint256(0x225f566aa16bd6e985105c1d688604cd7ff3954cba18cf3055b7c100802f88f2),
                y: uint256(0x23c4b52272dcb424cf71be52cf0510989a57591ce77b75983e09a99f3c780667)
            }),
            id3: Honk.G1Point({
                x: uint256(0x0917a974f368ea96893873aa81331212643b96a97aca0a845eec877458793133),
                y: uint256(0x27cb067cbf4f35ac28c80349a519053523be15116d01da7e20f6cc4eeb0535e2)
            }),
            id4: Honk.G1Point({
                x: uint256(0x2f654ca3ffff6135134b1d94888c19792a32df73d065a52a865c900d4c75e62a),
                y: uint256(0x07a88ccd1274fb49dfc7e7c6f2586737f319b6de1a8aa62a17a40a50f367b093)
            }),
            lagrangeFirst: Honk.G1Point({
                x: uint256(0x0000000000000000000000000000000000000000000000000000000000000001),
                y: uint256(0x0000000000000000000000000000000000000000000000000000000000000002)
            }),
            lagrangeLast: Honk.G1Point({
                x: uint256(0x126c0ccd8276d578c5f98365a2a294e0af899dcc0407010932550b4a744a37c3),
                y: uint256(0x274ff54e770ab182b2e720316fd2ac2c8132c04167e3f41cbe298742ca822bd7)
            })
        });
        return vk;
    }
}
