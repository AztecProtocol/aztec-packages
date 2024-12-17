// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.21;

import {Honk} from "../HonkTypes.sol";

uint256 constant N = 65536;
uint256 constant LOG_N = 16;
uint256 constant NUMBER_OF_PUBLIC_INPUTS = 6;

library EcdsaHonkVerificationKey {
    function loadVerificationKey() internal pure returns (Honk.VerificationKey memory) {
        Honk.VerificationKey memory vk = Honk.VerificationKey({
            circuitSize: uint256(65536),
            logCircuitSize: uint256(16),
            publicInputsSize: uint256(6),
            qm: Honk.G1Point({
                x: uint256(0x0ed1228aa376d3ac181b2e0b572d243615cf473b20645ac5914b7c7b20f54a10),
                y: uint256(0x0a01d55e860a4d3a661395f9d17e1c44b6058b6099539cb1a4302fcd13b35d68)
            }),
            qc: Honk.G1Point({
                x: uint256(0x106bff91418858c329df3d01f467bb55688ebc343ebb65acd1e9664be358e993),
                y: uint256(0x2d9cd9783c6dd8df242c78ba10fc3d0b8a05fecc5865e94c96d12566eed74561)
            }),
            ql: Honk.G1Point({
                x: uint256(0x092e1a5431e67f41abd28c9b103ef1fb90a93ff2474f2f5bd2550387fac4b6d6),
                y: uint256(0x272df56e1a1740f88fe789b1e63112068687fdc95ef7612024d550202bcbe41f)
            }),
            qr: Honk.G1Point({
                x: uint256(0x00ddad5b6f421b4dc6bb73ac297c784419ef94900740fe5dc2c0bd4f26e511e0),
                y: uint256(0x0b415d844a10a6892cf8eedc6c6ad624f1ee5ee17fd5f0729d46917fdcac847f)
            }),
            qo: Honk.G1Point({
                x: uint256(0x11af45b67ecda10a79c68507c0487b6e1a8a8b71a5911059619afee17e0a57ca),
                y: uint256(0x2974fd4439c12128eb399ba3b0c7a74b1c86c1ac16abb755083dc6f62e00f459)
            }),
            q4: Honk.G1Point({
                x: uint256(0x0a4e034f2d3b73ae4eb6ff0db3fe8e7b0357e6dd375a3107d1e4d9eb5ceb1e5b),
                y: uint256(0x1266512c0da5b14ede1f1d5b80ad9dfa43b3c71b2c0bb11c9c123c70eabc62ad)
            }),
            qLookup: Honk.G1Point({
                x: uint256(0x09d9383bcfd22e2259f1c2a9a5c0d2c8f999f8f1c5750fe571a2ca9f827f6274),
                y: uint256(0x0376fe8d56d38514322cdd2e4c0fb0aa9ccb4281a748b45adb055ca4b51b16bb)
            }),
            qArith: Honk.G1Point({
                x: uint256(0x11ff48b12a216298b2f8efe8dc2f269c1e9f62917ae7ac83c92ff6aea3a2d2fc),
                y: uint256(0x2df51751329a326d1374b05e3326d25e145fb20804d78127bf42146799959cd5)
            }),
            qDeltaRange: Honk.G1Point({
                x: uint256(0x2c9fffb3a9f0da1f3f8f732cb0873b437cc1dc97a5d9730d19c31df4a1c1f540),
                y: uint256(0x1118a1349f966cd8bb7b9557c059c3b936a5b189e8d56f75fffc6511adac2a09)
            }),
            qElliptic: Honk.G1Point({
                x: uint256(0x2d05352c103814f8855acfda27603975ae3dcdb9b08592d4c999769d84047e0c),
                y: uint256(0x15c7b3939f3108548006275aa6c62b4cc3095add5e1e463f2a3ab57eff4b9b3c)
            }),
            qAux: Honk.G1Point({
                x: uint256(0x1055198df3ec55ad61ff8c8f824bfc3cf74e459f46dd1c1d2ace45890e9b80fb),
                y: uint256(0x07725ad2b53ee322b94db4b28baefdbd7239bf4d9c2e9e0d9565bfda8954a380)
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
                x: uint256(0x26b2ad965e92409ddc7dc6f05eb2516a3d46556ee0fe42d3be9284f43c164268),
                y: uint256(0x16604235232876ec81dcf3009e2a5511ff7deab5c8d5fc1688a01f70641cfa19)
            }),
            s2: Honk.G1Point({
                x: uint256(0x302fea7a6ae8b64fe8e117cd9450d8365a2854b3ae7ddba866274e072a33e3c9),
                y: uint256(0x199f7fbb7597bf2aad7560b458c1d82b12b8dc403d52a5feb5d51f1980756c09)
            }),
            s3: Honk.G1Point({
                x: uint256(0x2488536441f1c8d33ff3fb367eb57512b610cae764a88e062ed0ec73fba9e307),
                y: uint256(0x146de607134bad0e3c2bde26e9e98317b71aa7389a4f5c2d28747f2bd6d4dade)
            }),
            s4: Honk.G1Point({
                x: uint256(0x25f8a81f0344b1784b8c04d29afaddb2c9fb75de95d819a6a319a30aac40d841),
                y: uint256(0x16e87a99f0c181fdfe028986561ded38c218a4f3e6a4d919d36c32e4d6ab60db)
            }),
            t1: Honk.G1Point({
                x: uint256(0x00132b961b9e8baa0e250bed996c62a966f1b079b7e9816126c5b86bf9f1f075),
                y: uint256(0x05d50d691281482fc032b4308517fec893094a6dcee7c45aaabfaf3505ef454e)
            }),
            t2: Honk.G1Point({
                x: uint256(0x0bcb7a54ae4377b41e9423a7804138aad684255df2369ed797a9b565e0b9c0b3),
                y: uint256(0x03c0febe0892c50980262ab672f1fdd1a0d33bc3149ca1f62176c7e4384bea10)
            }),
            t3: Honk.G1Point({
                x: uint256(0x2ca522e0da49dc12acb6203b8e863f54c76358fe6906643197470c3d5c1d85fc),
                y: uint256(0x042538987110445b116e4c25ff0e28a55df6898de39f7f8ffaa933353ed36e93)
            }),
            t4: Honk.G1Point({
                x: uint256(0x25b80f778ed684cfc28daf11bf3e9d06c0a83fcef2c5b30ae3a58db8672ead3f),
                y: uint256(0x17cb62830be2fc016aaed9d86aaee46777aa337d7dc7e6dce3f7a4b13935ef50)
            }),
            id1: Honk.G1Point({
                x: uint256(0x03b8602a4ad473e33cf7b8bcbf117818f01e940b5bec035fe7c441a040ad828e),
                y: uint256(0x20437c04120868065a9644e26bd3c53646ede89246acf9bdbd23e8a6c8dba624)
            }),
            id2: Honk.G1Point({
                x: uint256(0x101f5775ed011ef78a262c29eb0ced5ae3ef009e3f2a5c0071cd5c56b8ebec4d),
                y: uint256(0x1e148e8c7f4f7f7a3f6638132838497eaafed827da5bcd09719f5d96884f3f79)
            }),
            id3: Honk.G1Point({
                x: uint256(0x2197860a1b2fc4ab23077177ce37cc48e13f2a63ef8088b34f9942a7d0af5427),
                y: uint256(0x2ab09ab203f3afea533223c1b903fa583bede76688ec0fbaf0b7287500303528)
            }),
            id4: Honk.G1Point({
                x: uint256(0x278337c91d91a449c73c10793a10795296b2de9b3e056f6163dc2aff872a981a),
                y: uint256(0x0a2a57f0c362c6953fd99229fa066e006084c4b53e2e3b1012b53a1b46e97e45)
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
