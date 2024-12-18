// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.21;

import { Honk } from "../HonkTypes.sol";
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
               x: uint256(0x043d063b130adfb37342af45d0155a28edd1a7e46c840d9c943fdf45521c64ce),
               y: uint256(0x261522c4089330646aff96736194949330952ae74c573d1686d9cb4a00733854)
            }),
            qr: Honk.G1Point({ 
               x: uint256(0x291338e99e7857222c76c5e4ba8b954f5fde09fd2f05634d622ba379657cd501),
               y: uint256(0x137030ce3236d7c12307adf650a73b87fc95a774ec43ac0a3a341ef26b7f56c9)
            }),
            qo: Honk.G1Point({ 
               x: uint256(0x0f90f4bb16b330b82ef51e7ce3f70a9310ea2d3c5ef855f07b6f58081b5ef41f),
               y: uint256(0x0e09412eea75978da57db1d3fa6b7d14c0e282c378be9a6d0efc5770863ed70b)
            }),
            q4: Honk.G1Point({ 
               x: uint256(0x1eec247154ced5c29b0836528d7c19eda11399dc21e23df4bee4b5cd0bec659f),
               y: uint256(0x107cc382fdee2f6530d39b072a2bc50bdb0c0ac4b054a905b03b9d53bebef404)
            }),
            qm: Honk.G1Point({ 
               x: uint256(0x0c17b7ba3864cabe287a2b121b5cb3f8ee4ede87a7f656b8d9b470be025007c8),
               y: uint256(0x09590397bf354089980bd40f5d84f4c12faa8b4646425fa660ab7c4c76fb4859)
            }),
            qc: Honk.G1Point({ 
               x: uint256(0x2ac1a00b4c9bb4e7deef8d7a6bf9e26e61f2b935409e41c5770c074303b6d142),
               y: uint256(0x192d962de288fb26f3d68052b2f475e884ca47e595de1184171cd1500249fa66)
            }),
            qArith: Honk.G1Point({ 
               x: uint256(0x1797e3e7ee9e4f42b42bd375f13f2ccb395b827e9079e999b6c128d9b083c395),
               y: uint256(0x101a60efaab1c8564add45d41b9147efacf45941c3efe93c3568bde1e08e1919)
            }),
            qDeltaRange: Honk.G1Point({ 
               x: uint256(0x0e84090add56f2500ab518c655cae63896ea793e6b3f6a14218d476534109610),
               y: uint256(0x2b78a584bd6ae88cf4ec7c65c90e0b65df446fdddba972f3c4414ad3c901f4f9)
            }),
            qElliptic: Honk.G1Point({ 
               x: uint256(0x1bd6129f9646aa21af0d77e7b1cc9794e611b5d59a27773f744710b476fbd30f),
               y: uint256(0x2f8d492d76a22b6834f0b88e2d4096139a9d1593d56e65e710b2f344756b721e)
            }),
            qAux: Honk.G1Point({ 
               x: uint256(0x056ab50282da428d93b17cbd1c81267dcebcfbabdedb47b2d715b5baa6520bff),
               y: uint256(0x10b4e7bd9d6d91a57b0695be166ffd27cbeee602bcb5a9ed32c8d9440912cb72)
            }),
            qLookup: Honk.G1Point({ 
               x: uint256(0x19e2d786ebad24caf1bef735441e58525a2f9b5807b2102f295c58cde00f5c97),
               y: uint256(0x085713ce7bac807a084a66904ebc6e695840e8cf405a6fd0c325f8bfcf7c2dd8)
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
               x: uint256(0x19a07402ffcc103c3d8fbfbc7e9a660147d7380e65c34f64b75701b8d4868c11),
               y: uint256(0x0b7ab8c749a4af75d6100dba9246d7f993748b326d23791a595e21a17653fe30)
            }),
            s2: Honk.G1Point({ 
               x: uint256(0x027234cb39eacbf2ebe98907cf433e429a37933e429d4f24df14274b5c4d2549),
               y: uint256(0x2c1ea0996e3fd6cfabcfc6bbd4c86c65fb19c3dda2ded5c4f973af397e8e5c8b)
            }),
            s3: Honk.G1Point({ 
               x: uint256(0x243daee8a40861aba1ef660929ee9e874e52cd8e8d75f8c0245852369a731491),
               y: uint256(0x0a20f23c0697fb0698478f7a861dde5e18bf5aa34f4731178e74f7460df49a88)
            }),
            s4: Honk.G1Point({ 
               x: uint256(0x18b8202abb615440b5544d88092245911d2b5ff3b5a4a80bb15dbabafdfb56a7),
               y: uint256(0x096a6685f36b1ca09a62820ae3be7538128093440fa943ea7412617a6d927916)
            }),
            t1: Honk.G1Point({ 
               x: uint256(0x004067623374b7c3965c7d8444b57ac2d81269c7eb3cb4f7b16568b2f8234c96),
               y: uint256(0x0e605f3ad72203e21301ef1b5333cae1d8063220d1996854beb0c4fbc33bba9d)
            }),
            t2: Honk.G1Point({ 
               x: uint256(0x17aafa80bf54a7e6cc66472f9ccd70efa5044207a95191716ba0195b5a432266),
               y: uint256(0x233ecaca2ddbebb0484a44e6f55b8c8614c7b5e0ce31b51d59d6b21322a307a1)
            }),
            t3: Honk.G1Point({ 
               x: uint256(0x0f808f231e43f089639e05c235642b43ef91df7b6b2d51f3b34d17450bf4a536),
               y: uint256(0x079b5c6882eb75200d55f88b75280a34c2ec6fe94d3660254afc72f390dc7567)
            }),
            t4: Honk.G1Point({ 
               x: uint256(0x0765bf6645e4cf63f05d9b0efd06acebce309c685a3b05e613574ccd7316677c),
               y: uint256(0x09770f145625290cdcb08bae4e6f0a26897b5988fbaf9529e0a3326bfdb537ae)
            }),
            id1: Honk.G1Point({ 
               x: uint256(0x292298ecab24d2b6f6999cac29848def2665a62342170311f44c08708db0fe1f),
               y: uint256(0x277022c35d3145de166b139aa94609551122915366ba42ff7c5157b748fb7f9d)
            }),
            id2: Honk.G1Point({ 
               x: uint256(0x2ddc6a05ccd584bdfc65d642b39a3be3075e7a370602112dbf9fc644789acace),
               y: uint256(0x1a4167481d5f295af9921741bd0e32dda7a78cb391132b31ab4a77559c297c2e)
            }),
            id3: Honk.G1Point({ 
               x: uint256(0x19629b85ab2acf9713223ff4f758882af6247963bbf2f6ec4f9cbcde13675b87),
               y: uint256(0x165063fe922948bf1d065a882242724c1bde5fdfd93be29586b45e1ce2cc750c)
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
