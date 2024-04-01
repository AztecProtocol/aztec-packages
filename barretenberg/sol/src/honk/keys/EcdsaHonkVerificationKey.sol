// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.21;

import { Honk } from "../HonkTypes.sol";
uint256 constant N = 0x0000000000000000000000000000000000000000000000000000000000010000;
uint256 constant LOG_N = 0x0000000000000000000000000000000000000000000000000000000000000010;
library EcdsaHonkVerificationKey {
    function loadVerificationKey() internal pure returns (Honk.VerificationKey memory) {
        Honk.VerificationKey memory vk = Honk.VerificationKey({
            circuitSize: uint256(0x0000000000000000000000000000000000000000000000000000000000010000),
            logCircuitSize: uint256(0x0000000000000000000000000000000000000000000000000000000000000010),
            publicInputsSize: uint256(0x0000000000000000000000000000000000000000000000000000000000000006),
            ql: Honk.G1Point({ 
               x: uint256(0x2aa1e5d9538920238fbd3438b27e069c1edb9c2807e75c5ccb78102d502717a5),
               y: uint256(0x2c2cee219fa2dcfc815cf63a3f6519c8ef3a048bb668fce2136ef09a3f1ed12e)
            }),
            qr: Honk.G1Point({ 
               x: uint256(0x001e152cc12c0b54dc2d3bd1d7d017bf7491477d42620b73a0440aade3618c2e),
               y: uint256(0x2315ed9f374367c436dd9c6f429813fac22057de80f4c3370fa123d5f78aef2e)
            }),
            qo: Honk.G1Point({ 
               x: uint256(0x1e03c43f995f5a063f6d9a629585b91a77a49190e6a76db92fa1b679ebbbb694),
               y: uint256(0x062c61a0e3454d8ed5dd8198c1db15612ed49c28685efe35a353f9c44e0c42fd)
            }),
            q4: Honk.G1Point({ 
               x: uint256(0x1c919d8b75b3d41e260eff3b817f7a5a1bcd1387b8c5269b7f7cd7610f687a1a),
               y: uint256(0x266dfb8160f9492ae89282d7301a6252a5fc86b785a055959a85559fa7fe313b)
            }),
            qm: Honk.G1Point({ 
               x: uint256(0x22b152101522ea0dec8afd61c48b2a406eabc0d39b46016af995a0d1b3260a16),
               y: uint256(0x22a67aba4da604029085db563b8c5f60ca0f9b4f12e7e845eb308b38d323d282)
            }),
            qc: Honk.G1Point({ 
               x: uint256(0x0847b07bb1b03ed20243d7b8abf78300f7065713fb9f3753dfdcca3d25244507),
               y: uint256(0x07ff6fd445f7381b12a90a300e97caabb6fc23935c9ea235e4a837fdf341de40)
            }),
            qArith: Honk.G1Point({ 
               x: uint256(0x01e6b4db22f35dd68007f699e1543653f270632f143d7e4164c6dcc4852540d3),
               y: uint256(0x25d7de890f88c904b900ae61e3d6eba8c2601793e0ef05eb25222ceac9c79ae6)
            }),
            qSort: Honk.G1Point({ 
               x: uint256(0x0276b7be1fd261eff8381e6e8ffdb3725940af81118df85d7d8c608a4c90b298),
               y: uint256(0x19e04b6e50057551bc37fac5761c75b624913895785b28b8394543ce0e2af753)
            }),
            qElliptic: Honk.G1Point({ 
               x: uint256(0x246d59a16c1352a8873e7f8a58b87bccfd189fc78d27f956f026236fc7d16162),
               y: uint256(0x156d472d90596472eb771c56f370e92cbc22282d7c7a01f7057c1d3ea70c92f2)
            }),
            qAux: Honk.G1Point({ 
               x: uint256(0x048d8152d6204d873a42e7e86edca5a880ecfb96c18b2294098019de390755b2),
               y: uint256(0x2d36e390f7fede4cd8fc187ee4ed1b39f59ca26de94e6f5ca9813dfe4a786381)
            }),
            qLookup: Honk.G1Point({ 
               x: uint256(0x1e7e7ccad6262d34fc92f0cc0aba7f07427b97099fd6b3c21eb0bb5ae781e9b2),
               y: uint256(0x25a590063ab4ac8254cac9a4faa08bb921038bb3b3f87faa0e04b9470e197be5)
            }),
            s1: Honk.G1Point({ 
               x: uint256(0x2a471e6e6e9aa115123375f50bafdd03f799672c26e577e1beb7f903de2b96c6),
               y: uint256(0x28989bb0e1f9a69bde57d64557a24beab02921b2cc9de388d9963825705b6fae)
            }),
            s2: Honk.G1Point({ 
               x: uint256(0x15c2a00e86ae04173083e75e79b479290879258c68143447fe20418c3e322d15),
               y: uint256(0x181de2e886b42daa1f3349da50775abd7fc4e467d8b026d20118e046cc31df2b)
            }),
            s3: Honk.G1Point({ 
               x: uint256(0x2b4610081743e2c3e199358f8cdd959399b8210873e0f173bfede3e191a76372),
               y: uint256(0x0269f731fc4ba4df8b824a794d39692452e911450c261bd7c0ee421a187f3d70)
            }),
            s4: Honk.G1Point({ 
               x: uint256(0x2599ef03b93cfa8e3dfc50a671f95aeed1fd6bcc137ddd18e8408f2b46c8a074),
               y: uint256(0x304cb90dbbe026323e92fe385f2e2ec108c524cbb7bb0f858429af8ec9b80ea1)
            }),
            t1: Honk.G1Point({ 
               x: uint256(0x1ddc9ef86584375e5998d9f6fc16a4e646dc315ab86b477abc2f18a723dc24f6),
               y: uint256(0x03a3b132ca6590c4ffdf35e1acd932da680a4247a55c88dd2284af78cb047906)
            }),
            t2: Honk.G1Point({ 
               x: uint256(0x1e4cde3e410660193bacdf1db498ffb6bf1618c4d7b355415858d7d996e8bd03),
               y: uint256(0x18d7f0300f961521ead0cb3c81a2a43a2dea0fdcb17bd772aef6c7b908be4273)
            }),
            t3: Honk.G1Point({ 
               x: uint256(0x0e77f28b07af551fea1ad81b304fd41013850e8b3539309c20bb2fa115289642),
               y: uint256(0x15f92fde2f0d7a77c27daeb397336220ffc07b99f710980253e84f8ae94afd4d)
            }),
            t4: Honk.G1Point({ 
               x: uint256(0x2285ea4116ca00b673b2daadf596052b6d9ba6d231a4bea8af5a3c0f28c44aa4),
               y: uint256(0x076bf1e1f682badebfca083e25d808e8dae96372631c0721a7ee238c333a862a)
            }),
            id1: Honk.G1Point({ 
               x: uint256(0x24ec1e72fbaf9ee95dbc8a2abfbf8858799576fb9b8f5e7e63d8e0b1da32e692),
               y: uint256(0x28b7122f8e5a7397bf78e8bf8731a285f89516d3627c2c6b4c170b30b82faaf3)
            }),
            id2: Honk.G1Point({ 
               x: uint256(0x206857ef4f7cc72a455c9c61a74fdad900a581f85a3001abac02e6f9bdd57243),
               y: uint256(0x1f3f454b77a5f607614b625059f2ee804af5c5b65beed4c61b48fa1bfcf1a819)
            }),
            id3: Honk.G1Point({ 
               x: uint256(0x0946af4969c7508be03d0216caf93913dc178fe870c8c2c80958b3c492f383e2),
               y: uint256(0x0e1b3d5bf9b9152109d937399f9963626f38734734ece5f71d49f986a8fe2c1b)
            }),
            id4: Honk.G1Point({ 
               x: uint256(0x195028efca7e54f5cc0b50bea74815f18c572a6b1ea833e885e0af3e5f0701fd),
               y: uint256(0x100e2da82d3e2c3157f190db75110b11f18c317945577f865ef830860921d737)
            }),
            lagrangeFirst: Honk.G1Point({ 
               x: uint256(0x0000000000000000000000000000000000000000000000000000000000000001),
               y: uint256(0x0000000000000000000000000000000000000000000000000000000000000002)
            }),
            lagrangeLast: Honk.G1Point({ 
               x: uint256(0x28bf8c9eeae6946902ee08351768a3e4f67d812e6465f55f16bf69fad16cf46d),
               y: uint256(0x12dab1c326b33ea63ec6651324077c0ea2cb0ddfafd63fb8f9fbcc70bd53d7e0)
            })
        });
        return vk;
    }
}
