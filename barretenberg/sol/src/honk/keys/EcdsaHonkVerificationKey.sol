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
                x: uint256(0x222da11caac0ef8c8d024bcd3ce7ef9da65cba415dc078d6c1e99efb9d296476),
                y: uint256(0x06b0caa4e59eeea611e3d82aa4c1be032ea48d1ebe99a2120c6b1d34ad52cad2)
            }),
            qr: Honk.G1Point({
                x: uint256(0x21e30ea6ddc102c69e495eb2fea0c35a5ff332e9ee84f53b8fb4631334ea43da),
                y: uint256(0x1f0949f1e19f70d19120b05fd63f5a0011d7d26d8d68c5126e8f2f87f2c96640)
            }),
            qo: Honk.G1Point({
                x: uint256(0x195fd185370fead6c4a67e4966ee902847709ff7b9a408fe61028fe8e41a4f6c),
                y: uint256(0x2b7402e6aae9acf9aa178a122329b2337628d1ac1829d4436553a292fe6ee9db)
            }),
            q4: Honk.G1Point({
                x: uint256(0x2d86c5fcb734347d1fe12c89a3821942ad92f3d487e5248f4679821da50992d7),
                y: uint256(0x2909d7ffd3e7bbff48ec38a63b31e9871b574da7513162f7e35f2adb2188b24e)
            }),
            qm: Honk.G1Point({
                x: uint256(0x198c7255cce12fc3ab78a81b317e7767b3bb2da41cbe6b704f6945afb88578b4),
                y: uint256(0x1dd51e2a194f4302874917d4694a80e0876b503e7aa9be663b458daac22ae850)
            }),
            qc: Honk.G1Point({
                x: uint256(0x0928eca70f2df77dfe083e779ac86bfc03f0e4d1eac2bf07f7726e4be44844ea),
                y: uint256(0x137c94cc81fb56857d48f64c3dde2877a79f8077ce08d481a1c57d90e59f3bb8)
            }),
            qLookup: Honk.G1Point({
                x: uint256(0x148815ca04dbcfecb81c13d5339275f8b670d99a36d80115c6c632ad74e4bb2e),
                y: uint256(0x158c91fa2cb7239b8ed4514762fdefe02bf610e31c09c1a7e483716d1c0079ea)
            }),
            qArith: Honk.G1Point({
                x: uint256(0x20394d5902df2484805d610fa80bbca7e88fd770d69f95cf79fe68cb7f853395),
                y: uint256(0x1cc036a3c3a9ffa1e690e85a2c8559d1c353d29958ca5423f78920352ce85440)
            }),
            qDeltaRange: Honk.G1Point({
                x: uint256(0x15fcc88179a42b2e971f7d5a710cd683c5704bda5b988d71694f4dac3e520950),
                y: uint256(0x017ecfec3f1aa9d402f7850e540a23a008ce4bf83a137a6cc0c859ddb6bd09cd)
            }),
            qElliptic: Honk.G1Point({
                x: uint256(0x0cbb876b4b320f9cf4a32400a6fd7fccf62c4eb5f973a8584fe76113f575b5fb),
                y: uint256(0x2a7d7e704697d287c2fca5911ed04eac8345eb96fce690c0ec0ffcd696cea904)
            }),
            qMemory: Honk.G1Point({
                x: uint256(0x3030d61ef1f8e59aa0a5b50d08cad060a400a52075936ccc2b697fbbd5d350b6),
                y: uint256(0x0ec3fee2986ad108a8780830283539990e53b70dc4d17508e5895da68d48af67)
            }),
            qNnf: Honk.G1Point({
                x: uint256(0x1cdcfdd117bf90784a61d894ca2ffcd755f8d38f31e2c6a02a835ca236b3ccae),
                y: uint256(0x0556fc7b9419c4278ef1075b4ef24d0e4192340e73fd68c4e1f22b5d3b6f0ad5)
            }),
            qPoseidon2External: Honk.G1Point({
                x: uint256(0x0503a7b85dcc9b1807cb3c47b11d210a597bf4aa37f580cf52513c60b57bd75f),
                y: uint256(0x08962166fbdcf779cb4a711abb3fc45a92717ce9237557a4a425df9d026b7dba)
            }),
            qPoseidon2Internal: Honk.G1Point({
                x: uint256(0x1118e6867495ec76ad45d30034f84ad2a8276c52b6e6cd1f225ae9f6bacaab6a),
                y: uint256(0x26976de8a472a7c6761b297169b71178aaaf11140893e9add1c662d6ce68821b)
            }),
            s1: Honk.G1Point({
                x: uint256(0x0b91942d57362b440406e9668d4bed43f45f8a17ec2d94e8bbfb9c8ed51bcea9),
                y: uint256(0x06542cd207ccb494f9445828ae6391860f43822f7329691e63cff82dc00ead7e)
            }),
            s2: Honk.G1Point({
                x: uint256(0x1b332b3aa473a04c80a16a2fea6977f2ab7a881c8e30cee89eaee5d0914a6d9c),
                y: uint256(0x00c6ec7703d857a5bc384501e3ad7f219e5b6f504e44bb39c7b7deddf33b30a8)
            }),
            s3: Honk.G1Point({
                x: uint256(0x034c7dd1508dcd81b35e4650227b17250e2c5f727f845e2741207f3311e17b02),
                y: uint256(0x1039bbd1e98f2a1c722d4fe012b035ac19d3376dcfe65097ddbf12bd781f773d)
            }),
            s4: Honk.G1Point({
                x: uint256(0x1ab810653d7f51a81fafad146e590655efcf7d657f40f9296692fa8e56bf5336),
                y: uint256(0x02464db62a7f96655df1a58ed700c69c637965628cf8ad88efdac0efa4c981bb)
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
                x: uint256(0x186cfb4b0390d6df09d96587fdb8b69341eb8ac82804140a1788a25a96ca678e),
                y: uint256(0x0140d3802bb7ae2de28fd7838813d05b7c7752e2f5e2eb8fdf1a34aa30afe8c6)
            }),
            id2: Honk.G1Point({
                x: uint256(0x0c9130bdb71bcb34a79801d4a7339d34cc9156df2bfc87943af350689edbcb41),
                y: uint256(0x1158cd1f937b53230ae2194f98169035f6fe234cc8569b0af9968cbb18878518)
            }),
            id3: Honk.G1Point({
                x: uint256(0x235d4676fb2b58d1be798f994d59ecb609099f1171c13ba03c8b94e627022e0f),
                y: uint256(0x17eef40d8198347905bdccb6bdf6c0a3d644f98e33d431f751309c685a01b251)
            }),
            id4: Honk.G1Point({
                x: uint256(0x2eb5730274f685810be70c921eabc7c21c0ac1da5d258c932f3cb13ba0df6b20),
                y: uint256(0x11379118f0c18ba026b5e3771cc4b1bbec2dc7a7b91394ae6fc8017a02b0d275)
            }),
            lagrangeFirst: Honk.G1Point({
                x: uint256(0x0000000000000000000000000000000000000000000000000000000000000001),
                y: uint256(0x0000000000000000000000000000000000000000000000000000000000000002)
            }),
            lagrangeLast: Honk.G1Point({
                x: uint256(0x014334951df29e6970601497d10be93e00634f3e9fb0378838ce51953c7cbac6),
                y: uint256(0x1479a189c5e510683391e1a710ac0152b0314c11e5ac820ceab13ef611319340)
            })
        });
        return vk;
    }
}
