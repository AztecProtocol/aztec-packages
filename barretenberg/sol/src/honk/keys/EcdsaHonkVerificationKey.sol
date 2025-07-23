// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.21;

import {Honk} from "../HonkTypes.sol";

uint256 constant N = 65536;
uint256 constant LOG_N = 16;
uint256 constant NUMBER_OF_PUBLIC_INPUTS = 22;

library EcdsaHonkVerificationKey {
    function loadVerificationKey() internal pure returns (Honk.VerificationKey memory) {
        Honk.VerificationKey memory vk = Honk.VerificationKey({
            circuitSize: uint256(65536),
            logCircuitSize: uint256(16),
            publicInputsSize: uint256(22),
            ql: Honk.G1Point({
                x: uint256(0x2d78a7481612eabe41685d632609c9ef707c3b7199dec0df534e61e8a5a03095),
                y: uint256(0x24c539651db9949a127da4cc69f10da09fff27678eac3703b23c2c291dff6b6d)
            }),
            qr: Honk.G1Point({
                x: uint256(0x2cef536794e86be0bebbf1d7c375e4c6ce22b58f6b6a9ac85b5cd9398ffee0d6),
                y: uint256(0x2a7884e3a9bab07d818ec08bd3aefcd7f9be710e89a6903c00fccf27d79ed9aa)
            }),
            qo: Honk.G1Point({
                x: uint256(0x1ef9e2e6a7ccf2b784c991b9ffb46ccbee74384daba7d8a8e22cec1c5a6f263f),
                y: uint256(0x05407eb6d2609435c2514ffee3b95df65c71821f7b5f6b880bf8935b7577ede8)
            }),
            q4: Honk.G1Point({
                x: uint256(0x17d90ee7b250fa5e8ff14df694e711080009ce5b15df9e08f50f87f9c4ab71dd),
                y: uint256(0x1128e47bc14da55b863fc06da323a513f77d439b28b322b9882347e003a3e28a)
            }),
            qm: Honk.G1Point({
                x: uint256(0x155f27c7085e539659afa81d97b657cf5fe453ca5e6fb9c7dd5f936367186afe),
                y: uint256(0x01073683c148c966827e9e27fc53846f7e27544a95452c97130461d76b052147)
            }),
            qc: Honk.G1Point({
                x: uint256(0x2ab73b677b71490ab33065cb04d0f7ccfba6da8b334758822e5d8fa2021f4bfa),
                y: uint256(0x2bb07f80fc7b5b5beed2b55061685fae2cd3ec8657b8d192f1d7e295f23ec96b)
            }),
            qLookup: Honk.G1Point({
                x: uint256(0x148815ca04dbcfecb81c13d5339275f8b670d99a36d80115c6c632ad74e4bb2e),
                y: uint256(0x158c91fa2cb7239b8ed4514762fdefe02bf610e31c09c1a7e483716d1c0079ea)
            }),
            qArith: Honk.G1Point({
                x: uint256(0x2821e8faca8af57f90f91ce5b361720a8ce160c6340b0bb6344a5c1e4627a64b),
                y: uint256(0x2de261a7be70c2334c046374b43b3823951116cda0aaf34a5994b1284984847f)
            }),
            qDeltaRange: Honk.G1Point({
                x: uint256(0x06ddcf4e701589781135b97aeb69849dfc181a08f0b230037d26c7627132e1d6),
                y: uint256(0x0b999598216aa787afeabf11057a8489119af13212afebe19bb8aa627b13cbd0)
            }),
            qElliptic: Honk.G1Point({
                x: uint256(0x2aaa2c75d55a2b0e0211c38784bfee5b95263c43c5470891babc48ad77b864e2),
                y: uint256(0x28fab7f72b0e44c5d3b3ec1097ea41ee5db2e5c7f9926cb96baa3202569bfffd)
            }),
            qMemory: Honk.G1Point({
                x: uint256(0x12f6d6fe06d041606bd2677316b0e0949d81181c7ba2145aefbf47e759b6ae87),
                y: uint256(0x1767308d5bfde5afb5198cf69df256c3e9b23717354320b49ec414c4135f2437)
            }),
            qNnf: Honk.G1Point({
                x: uint256(0x0be4ad6cbcca5f4c53e891c1865b237bd7c4bfbb5d31e6d0d68152d74580804c),
                y: uint256(0x0cbcc3fd666729673aa773d5075ae73bfb54747f5befd57510eeaf6f41c4cfd3)
            }),
            qPoseidon2External: Honk.G1Point({
                x: uint256(0x0fd653ef84d048ab64001f46dd8e580e93c3f9f196842fa8af653950cc5ecc47),
                y: uint256(0x2d79ecb030517a00ac76140692e7aa0949aa3d4d094e3f8b48dcc18961db86e5)
            }),
            qPoseidon2Internal: Honk.G1Point({
                x: uint256(0x02a7d06b87b7640d54d381164b10431157819ce10b63e5825ccc91faeadcc1c7),
                y: uint256(0x082342fa3ed1b2e6acec489165be052fae6971be380f859302a61da2c896b97a)
            }),
            s1: Honk.G1Point({
                x: uint256(0x30152efff1d7cd9b577073c9d1f04eae5631b1bcbe620f59bb39f0a344aa5198),
                y: uint256(0x08d67a78abd46ad62adc41949bddf68cc7e15570446f3bfebf33421bdfb42375)
            }),
            s2: Honk.G1Point({
                x: uint256(0x265a3e0dd9613d1e71b3386162f8a6bf73fdb70cf852285d2b27dafc3277e738),
                y: uint256(0x0445cd8630bcce4743cf737c49dc6460f26ecac8d119dddfe7467bdbc69b1761)
            }),
            s3: Honk.G1Point({
                x: uint256(0x1988515a150b1fd134b0e2d839ddfae996f86ab842b45eead48508c8005747ea),
                y: uint256(0x29cfce48d6fe9241d46dfefcb39d41fb7a311762a300a128f6329d133357d617)
            }),
            s4: Honk.G1Point({
                x: uint256(0x2ed2e97acd486239a46f28de53d4c1ce4f21764534d22114460a742d7e4d2008),
                y: uint256(0x02336f32a643ac83237356583814dd81f9be01bb61c72ac49b127b3ea4138d6a)
            }),
            t1: Honk.G1Point({
                x: uint256(0x0b7b8581cf25a963e5ab081785d7a70504db9b8b710bd019de5be4c980a6536e),
                y: uint256(0x0c9c04b32d4d51cc162b703f571ad5748859b9133c961345d71273183f2a68b2)
            }),
            t2: Honk.G1Point({
                x: uint256(0x2d073920df90f0f98352d5bfc545f19e9622f5fa49d82300e5afb9acb6d030fd),
                y: uint256(0x0cd29f3121acf9430707827d9b0805f991402d944261e1d648d9c08c7cec5475)
            }),
            t3: Honk.G1Point({
                x: uint256(0x1df7f08d004e38c6cc24155081bf68c1a6444b526bd98beea00feabc8ea337f9),
                y: uint256(0x0471714279ef8a51213c70cb4fa89e73caf1ad84fa8c1447f41f6eb6bb897491)
            }),
            t4: Honk.G1Point({
                x: uint256(0x1d794f2aaa0524cb1d97c2ff125061a697ec693323edcff93f0e5a59bcd2101d),
                y: uint256(0x1baa78d0546b9e189379cc5a85c90293b8c30eb1e6955e421866ef4454222a92)
            }),
            id1: Honk.G1Point({
                x: uint256(0x1a005e652fd1f36af6e9313f73581743225dab6da23d663c08492782607534a6),
                y: uint256(0x0e0cb8a9d7fe59df3f6998c81ac49a0a012769838c00f6a72cc6b8351c421175)
            }),
            id2: Honk.G1Point({
                x: uint256(0x1189db2e2a1372386bc09535aa646b00f01cab257699637a06daea1d9ca7fe22),
                y: uint256(0x13e130b47a6756e70e1955a7ee79c0e16b48143119797d82845eb0606ba50895)
            }),
            id3: Honk.G1Point({
                x: uint256(0x2fa93963d201bc7d29090b17f86c7058c2d0c178ab8ca28e2b6dc80c751b8f83),
                y: uint256(0x2184d5c0c93a105985500c4a022ce540f1e46a7c79925bd2a3329f72d8f3510f)
            }),
            id4: Honk.G1Point({
                x: uint256(0x292fdd487c1d9ba1cecf6de4e45ee36e257a20fe9aa6e95f7cc63add18c208c0),
                y: uint256(0x022330e665a70ee0de2dd4c09b9e11c026da18853f0da2475601aa7c56434e09)
            }),
            lagrangeFirst: Honk.G1Point({
                x: uint256(0x0000000000000000000000000000000000000000000000000000000000000001),
                y: uint256(0x0000000000000000000000000000000000000000000000000000000000000002)
            }),
            lagrangeLast: Honk.G1Point({
                x: uint256(0x2923f3c900dcd4b0960f6202f3ce04f5b3fe7177373a0b65fc5b61e7aab7567a),
                y: uint256(0x27928037aa7b1d9486281fafb6c9105a1812ba8412298fcdbe25d114d11f33f6)
            })
        });
        return vk;
    }
}
