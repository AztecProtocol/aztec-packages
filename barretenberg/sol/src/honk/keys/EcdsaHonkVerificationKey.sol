// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.21;

import { Honk } from "../HonkTypes.sol";
uint256 constant N = 65536;
uint256 constant LOG_N = 16;
uint256 constant NUMBER_OF_PUBLIC_INPUTS = 6;
library EcdsaHonkVerificationKey {
    function loadVerificationKey() internal pure returns (Honk.VerificationKey memory) {
        Honk.VerificationKey memory vk = Honk.VerificationKey({
            circuitSize: uint256(65536),
            logCircuitSize: uint256(16),
            publicInputsSize: uint256(6),
            ql: Honk.G1Point({ 
               x: uint256(0x0d26081764ddeabfed843e3c5557f131e164ef80202b29336be0ee6cd7b8bb09),
               y: uint256(0x1f119104ae836c47196ac80dd48d743fe8dbc00b90a732e8850cf39ebc057fd6)
            }),
            qr: Honk.G1Point({ 
               x: uint256(0x0a5832561bc20ca6c3bd6a45383192ceea476369cf1409dcc923ad0db043bd1f),
               y: uint256(0x191a108202c6f5d4d6b6fae14259b7849ee8e0a483d3aeada8f12c19e6977d30)
            }),
            qo: Honk.G1Point({ 
               x: uint256(0x0e8a61ac645f4b74493df26d9e888fcefc3649cc1f6d925a48091faeca3f9cbd),
               y: uint256(0x09a0a2a584c84de3e86235217b3a31e40d871a815232c1cfd02343fa03c83e84)
            }),
            q4: Honk.G1Point({ 
               x: uint256(0x1dbccae2d56db0ee959d57572c7da6dea1853fbae2bc8fa8c862eb163dae0bb2),
               y: uint256(0x2f1f1c14f8a981a256c96e72e8d18393bb11da62223f18cf72fe5639ce9704a4)
            }),
            qm: Honk.G1Point({ 
               x: uint256(0x1da7f877a5a897c91204a2c894f8d121c6a054318427025f87556aeba16fff02),
               y: uint256(0x0438f74fa9432220b697edfc8be7efd8d9773d6c6208c908db13c41095de5f37)
            }),
            qc: Honk.G1Point({ 
               x: uint256(0x028fab352dd75db278f199638256453cacbf277e1bdf2e82115e09718a2b26da),
               y: uint256(0x2c537e1ee36b91fbd25a6250a37332a93d6bda95890df6d9501d4bea885796b7)
            }),
            qArith: Honk.G1Point({ 
               x: uint256(0x035c79ae9870ae41757c5e34b582b1c56ede35aaae59ca00404d721d88207e7c),
               y: uint256(0x2d4d7bdef0e2cbbc267bb99b645d1626bdf8f42adb4503798a34cae5c09e9f8c)
            }),
            qDeltaRange: Honk.G1Point({ 
               x: uint256(0x07de3043acee4e9209cdbc0e4a8b6f6a535b1937f721d39d530e0ce232fa8287),
               y: uint256(0x274ff9766cb2ebb15e8971dd046080d167743a825438eb577c1ac5a3cc9c54d6)
            }),
            qElliptic: Honk.G1Point({ 
               x: uint256(0x1534a28b15c98473424fe8f04b314269e2ceb84b2ba03d9233e5621e392ec778),
               y: uint256(0x21383bb1156fec27094fbe8b470bb9bd38f09050b54000b9e8210d495c303c50)
            }),
            qAux: Honk.G1Point({ 
               x: uint256(0x12d0e6d9b6385ab7ecd2dca74f9bb94f6242c9182d64ec7b243c364e3ab623b2),
               y: uint256(0x1c2ccee3dfb933fd21007ac4fb913c021d4f606373c172cb7f65e7b65c8a19a9)
            }),
            qLookup: Honk.G1Point({ 
               x: uint256(0x0c1d4485ea10a2e7ac60989c6b89adb46cfe368c3aea2e98dd23dda8c0177eeb),
               y: uint256(0x2ec88245a56ced2a57fd11e8a75055c828da386b922da330779817f4c389a7ea)
            }),
            qPoseidon2External: Honk.G1Point({ 
               x: uint256(0x2c1c2ccda8b91666f7bd30eb4a992c3e4c729adcf73e008348e8c97083d56242),
               y: uint256(0x2b418829be00d02f2e01a1fbf110420b328a44416e889990f1e81b735023ff1d)
            }),
            qPoseidon2Internal: Honk.G1Point({ 
               x: uint256(0x1f60a709d42d5e2c7b406365072a764300c610a5a8d2be21f9a0242dde7bd485),
               y: uint256(0x2c5af44525879b9580e7687e6a93dd55fd6aa9251d90a5c2c4fc0ea971e1448b)
            }),
            s1: Honk.G1Point({ 
               x: uint256(0x282bd3a32dfbf5fcb1123602ee8bb334fcae9fe4d32fcffe565701fea25c84da),
               y: uint256(0x26d6de44e383b5cfcb046b54d5b88b4c840f85bf6b355de813cfc82946b01696)
            }),
            s2: Honk.G1Point({ 
               x: uint256(0x00def638e4fdad7089dd2cc99e003e101ff5ed89c0f4d3842821a6636abeac0f),
               y: uint256(0x216b4b4bdcef902c4aa149e4c5e5ef69b4b2fa7909b03e6c527befddf9aea208)
            }),
            s3: Honk.G1Point({ 
               x: uint256(0x0e5217dc5c6f84fcae20d18267fe3aa126f1c78bdc848d5d155e965ee46d57ab),
               y: uint256(0x1c9d0fd84b8792f7fc102309d8298d734793efe6f917d6983495f8a327a4d836)
            }),
            s4: Honk.G1Point({ 
               x: uint256(0x2aa0999747c3673174ec7eb488e5e18dc9c0cc066677941ba659f8ff8b381db1),
               y: uint256(0x29abc69897e1af84be5d94015bd6fd94c6612cb259c7c9f2e2c72f76c900c5bd)
            }),
            t1: Honk.G1Point({ 
               x: uint256(0x1ca80e2d80c4058457bf2ddce67adec85e9d147eea6b130f11d37d3b80f977a6),
               y: uint256(0x2812e987a2950af642c89d778f1d8f0bc5b24e1f30dd454b883d4bb2696fada8)
            }),
            t2: Honk.G1Point({ 
               x: uint256(0x0e3ff1d0e58dbe4c2ad55e0b4ac9d28a78a504e26ed2d1468432d01f52f35003),
               y: uint256(0x03d5da7641a7698a0e7c920f0ab4ca4760ee05fdfaa8ea5b2a6fa0c1f7d15a0a)
            }),
            t3: Honk.G1Point({ 
               x: uint256(0x14a9f5aba97157d82f64938a827361a91cc94b66f88a9c0ca65be9b56e3f9821),
               y: uint256(0x1a6dbba0f10b19e540a198c66e04a35ee95ae33ee43b01852d294f06a4a08d4f)
            }),
            t4: Honk.G1Point({ 
               x: uint256(0x0934b14b98eab15c73b9ecc3453229fd602408a75d6b8b59242fa0eeeb3a4230),
               y: uint256(0x1c7079581fa387fd07d23e144ba9161cb2428e1ed84d1b61547a3688baad41ae)
            }),
            id1: Honk.G1Point({ 
               x: uint256(0x17fcf5224da2d584726a7b80972a622c6b982121c33a71fd400da52c8df37924),
               y: uint256(0x114b4bce95cd9f2aa6f7c8653e855406c1da5e44a3ef692c4435d888a315f359)
            }),
            id2: Honk.G1Point({ 
               x: uint256(0x2fef8b3fd63b5ca8faf76f47f6c73652a47df0b42cdea3abdc06c59aec2f3b21),
               y: uint256(0x01b2c58279557c3b4b1019d7700f9c1a69f255df49ca874728d18a6843eb581f)
            }),
            id3: Honk.G1Point({ 
               x: uint256(0x0713316ad4da65b28be231d997fc27558c9663cba7aeaa24dd2a94e5cfecb88b),
               y: uint256(0x2ab0460a36b81cf33745d9ac0cc66f46c22a2c0f22b97e78de63b0f94d746453)
            }),
            id4: Honk.G1Point({ 
               x: uint256(0x00022bd8bd7328e7449214b7ada33e0991108ad45b30afaef78f30bea2091f38),
               y: uint256(0x18a83d47716f4f134e9d29db7acc812e89cb7578a36e05b5043bb21ccc93f81d)
            }),
            lagrangeFirst: Honk.G1Point({ 
               x: uint256(0x0000000000000000000000000000000000000000000000000000000000000001),
               y: uint256(0x0000000000000000000000000000000000000000000000000000000000000002)
            }),
            lagrangeLast: Honk.G1Point({ 
               x: uint256(0x27949ee1c2c701a8ee2e8c253ae9e3a429f03da04547f6e17fd7d0d27ae07689),
               y: uint256(0x08e6579e77d56473d9b459c4265b407d29913310d4f155fd19348efe52bdd1d2)
            })
        });
        return vk;
    }
}
