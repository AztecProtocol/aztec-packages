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
                x: uint256(0x1dbc2d49981f1318140ca1106a52550e1c079613c92a2b23206d1504cfb2f86b),
                y: uint256(0x04d743fe1aa6c0e790573ff504c0b5068b8d630459835db49d24004e0f010ad3)
            }),
            qr: Honk.G1Point({
                x: uint256(0x06d4bd3d2520f2a248394d32ae446f689484f908ddcf272e978d431784e205f1),
                y: uint256(0x175cf52a76ee209fd0ff22a663db695c0d290b60d71138236aef5b329ab19432)
            }),
            qo: Honk.G1Point({
                x: uint256(0x2381d95872adb9e4f3955b2c49f978ee03b98cdb0abdf39b0968a507501c9dba),
                y: uint256(0x1b008ca9ebed2b85934fb415d074922e1def59790d010bb15729d3824beea8a7)
            }),
            q4: Honk.G1Point({
                x: uint256(0x2f2580b9ccf05cf1b0f017e01456a6bfdafcf9b3166c576c687de3c9e3c50304),
                y: uint256(0x0b371c7aab9c618ce48d244ef8356cde119972b5c40caf4a5f38ad817d448451)
            }),
            qm: Honk.G1Point({
                x: uint256(0x2be5953099867a3a2150e243842f051637662c71e3d7c19eb666f2dcb7d35ed6),
                y: uint256(0x1400e3f66ff58817c736185766bad7b06df6fc22d6394a458e2ee79f31d14797)
            }),
            qc: Honk.G1Point({
                x: uint256(0x1cebfae35f0e17cea692772e1b0f64a860a185a35fe4d91d52b1e08b133ef525),
                y: uint256(0x1398b2c0e75952e2614ec248b7f2002e710035f2ec026a386c1940e12203a173)
            }),
            qLookup: Honk.G1Point({
                x: uint256(0x2f52fd71248e5fb7fcda49e0778edcf84065f4c837dc259c99350f66d2756526),
                y: uint256(0x07f7f722d2341b84f37e028a0993f9ba6eb0539524e258a6666f2149f7edba7e)
            }),
            qArith: Honk.G1Point({
                x: uint256(0x0a2f3de6c4da1c2f6711875e52ee30c1eb7676fe3f04dee0cbe51d8e9314968d),
                y: uint256(0x1163146d3736c646b9f0d3e446b742a925732850136119397601ab9c729406ac)
            }),
            qDeltaRange: Honk.G1Point({
                x: uint256(0x0f75fa9241e6b995002a5dec650dd8ee11b2c95463b42b9bfd6886d861a81dcc),
                y: uint256(0x000b33ecd7762627f56dd05319f6c2a8f577d84c23736426a14a815ea240dd10)
            }),
            qElliptic: Honk.G1Point({
                x: uint256(0x23d68410cad93a2213d42fc11507040613f1c36376c79fc119af71f9240ddf85),
                y: uint256(0x08036d4655c57be0f4c5e4165dbb99102feb96cdff2eb5c7f02358c7ce06d1ea)
            }),
            qMemory: Honk.G1Point({
                x: uint256(0x1133465e96ae5ca432246d0fb87ce71c0f37b36dfdf404a6c97c487242a6bf71),
                y: uint256(0x1edd6fa7f5b8c58ac5bcfea2db37b96f66e55376162e9230d6b8b88f5ae04c6d)
            }),
            qNnf: Honk.G1Point({
                x: uint256(0x2634efbf217db5182ee476472d9a87972acb13713640fbd542b74510b53823d3),
                y: uint256(0x1f4efbc506f80a69e5185539cf24ea43e3d7a416989e8d5697fe651f5b525282)
            }),
            qPoseidon2External: Honk.G1Point({
                x: uint256(0x1bb2a291b05e1a09d92da67dce13ecfdf4311c3a6c717ed1822331033bb535a0),
                y: uint256(0x2ce5b67d60b91124c3906f07d0ce01476a3fc9cfcca33200d2aafba321b282ca)
            }),
            qPoseidon2Internal: Honk.G1Point({
                x: uint256(0x292fc33ecaeee0a93a3db74c63ecb036702ae9d9e10f115b4a41ca026748a8e9),
                y: uint256(0x191404cfbc6ecde452a8dc5e2f2971948fff39018c5ccd820c8454679a299e8d)
            }),
            s1: Honk.G1Point({
                x: uint256(0x0a185ce3c7f2823ad60e0217165c591d0fc4743a4ffd8df74e735eb842ec37d1),
                y: uint256(0x16003f72a8338960f090006eb8313aa3773a445c2dbc974e03337c0f0a643ffe)
            }),
            s2: Honk.G1Point({
                x: uint256(0x274cf54ae7f12682a78a2682118ef13862e8697325d1280d3758ae907238ba0c),
                y: uint256(0x06114456c109ea3e28becc1819131ca5902491ccf9738f27918a92c74d5808f4)
            }),
            s3: Honk.G1Point({
                x: uint256(0x1860e83dbaee0d906588cc79b49323f24d983b79a9dc90bf838d8fd8d5075c74),
                y: uint256(0x197f83bc73cde1744420bbfb265c78c4f97beb3f4d89c988b431a2e002dd7aad)
            }),
            s4: Honk.G1Point({
                x: uint256(0x3037389763af5b68ca15943e765c1a58b2a5b3ac251a9d942bf6367bf718f9ee),
                y: uint256(0x0ab24e2474238a7130b1da39c972873619dc1f2cdf8719f840daaeb14c04861e)
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
                x: uint256(0x20d80d8e50445042431974ff13f53c27c62c17d6d2100faac252917bc2666ac1),
                y: uint256(0x04bffddce3617713d52791e3344987b29b7c3359a227a03ca26857e813a84278)
            }),
            t4: Honk.G1Point({
                x: uint256(0x2a0724cfe33e0ee4b3f81929ef0cd1da5e113987c9aed1534cca51dae3d9bc2d),
                y: uint256(0x26983a78aa5c4f3103c7e6128a32f0fae2779a6f0efb2b60facdd09153d403c9)
            }),
            id1: Honk.G1Point({
                x: uint256(0x036e9faa607b6e7b97aa939face171293464ea9983674c2a23dc3586cb3646a0),
                y: uint256(0x1c44f59189b7da985accbd2810512c34b938f6892324326f3d8ed0445abf7cb3)
            }),
            id2: Honk.G1Point({
                x: uint256(0x25e2e65c5b496b09b0fbb4a4f5f26b0d7525b1c4973efcedc641052b05d1eeca),
                y: uint256(0x2ebbcc2e263835cdf1d29d1381895cadf5a74583998a7e23139e04d6ef110ecb)
            }),
            id3: Honk.G1Point({
                x: uint256(0x28bcb49916bccb9286a5fcc44bc513ed9df38d2042335556f7d7788ca87ad268),
                y: uint256(0x004daa3b3de855f9aac2dd1a04392f9c1bc9d9678b96b94705ca30361ff10c2c)
            }),
            id4: Honk.G1Point({
                x: uint256(0x13756493eec9a875b3984e91dd380a82db0f76ec4cd9b7f7c7393eca89525d51),
                y: uint256(0x1d1d4b3d152e00a6dc81dfd10caba54e964046c86ee19e39f43f1989bbab1d03)
            }),
            lagrangeFirst: Honk.G1Point({
                x: uint256(0x0000000000000000000000000000000000000000000000000000000000000001),
                y: uint256(0x0000000000000000000000000000000000000000000000000000000000000002)
            }),
            lagrangeLast: Honk.G1Point({
                x: uint256(0x17e0906260294d3d5c54eac5f5d339729e238f870f5e304f258cad591b9f6e8f),
                y: uint256(0x10dd66d911bcc3d85f85797e451edfd1d98b78130650208c3f8cf586c9e902c4)
            })
        });
        return vk;
    }
}
