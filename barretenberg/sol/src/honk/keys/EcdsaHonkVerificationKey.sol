// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.4;

import { HonkTypes } from "../HonkVerifierTypes.sol";
library EcdsaHonkVerificationKey {
    function loadVerificationKey() internal pure returns (HonkTypes.VerificationKey memory) {
        HonkTypes.VerificationKey memory vk = HonkTypes.VerificationKey({
            circuitSize: uint256(0x0000000000000000000000000000000000000000000000000000000000010000),
            logCircuitSize: uint256(0x0000000000000000000000000000000000000000000000000000000000000010),
            publicInputsSize: uint256(0x0000000000000000000000000000000000000000000000000000000000000006),
            ql: HonkTypes.G1Point({ 
               x: uint256(0x0556a41ef49edf1c7a4c2722d4c1e280a97f35bef4014bfa5ffb0b3576d38d88),
               y: uint256(0x0bab498a855b9d8a8d87dda6c02de0e35e900edd786c4fe48c5c9507457df709)
            }),
            qr: HonkTypes.G1Point({ 
               x: uint256(0x18e99b969f25a3ff3c5eb6039388f2e29d46871472ec07483c43e3fea996bee0),
               y: uint256(0x2d75cef08d9feee257373ef5540ceaac16f4794fb65383346b56f6d1be6fd26a)
            }),
            qo: HonkTypes.G1Point({ 
               x: uint256(0x083567262d2faa43b97a37bc46975fc3dc9b55140297c74099edd417019e6686),
               y: uint256(0x0f9260116575935597a859085b9f80f8ea5588baf1003e4def37490e08d1c454)
            }),
            q4: HonkTypes.G1Point({ 
               x: uint256(0x20458f91aae09360e4ed8cc84fbafdff00e68bd4fbfb76a935fdf5b50f269282),
               y: uint256(0x23973890e26de6fa58e7199451cbc7e1b4351e9ccf7ca4983d5aeb1a65cb258e)
            }),
            qm: HonkTypes.G1Point({ 
               x: uint256(0x10bdb2166dece4ffab771f06fa1dc7eaf8d85e1b7eaf7ab273aa98a2fe5aa0b6),
               y: uint256(0x093e7eca42efa62063bfb339ab263f980a27fcf161254405bc71067b4f8c41ea)
            }),
            qc: HonkTypes.G1Point({ 
               x: uint256(0x126ee474916e42dd8633d4c01ec7612654762994c785631141c7425a1d2f40d6),
               y: uint256(0x2fd61a60dbaa5773979555e3acb937f32dbf7b4ef4704d1160ee02f857b15512)
            }),
            qArith: HonkTypes.G1Point({ 
               x: uint256(0x1a1f98e2b936c65c37a25fa12bde230d9fec8e543e3559c2a098bf3c732b1219),
               y: uint256(0x24030b6459a5bf932c02d5675af6ea4216c4496e4c820921cbed1756281a2725)
            }),
            qSort: HonkTypes.G1Point({ 
               x: uint256(0x019ca6e2127d4c7ecfc60b39de91ef06b6432834fac6d93603d7a0459b3d2dfe),
               y: uint256(0x2586ab58c896d63183d335b59f55821f8199259ed15c68330e338b3d43666b58)
            }),
            qElliptic: HonkTypes.G1Point({ 
               x: uint256(0x1ee6a1ada683ea1dbb3a02923fa6276f7f184da34e003973e13b7b3717ca8a53),
               y: uint256(0x160623cdae77f43f778a42d5833068e4aecf7f2bd7de835571cc45baa20b8851)
            }),
            qAux: HonkTypes.G1Point({ 
               x: uint256(0x281b09583df8ea8dce721b3f6c041070fe85da0f4e83b2112b0aff4bd9521288),
               y: uint256(0x0f1150910d4aeab98fb0a80867b593e42d6cfb7943cf554268cb7208ef87ec4e)
            }),
            qLookup: HonkTypes.G1Point({ 
               x: uint256(0x10c2aaf29500dabdba1b4cd9aaa0d74e6b11826823b94e484f6dd904c9726e65),
               y: uint256(0x19dfbd2933e92638abbe6962916746d780ca072bbf75442bee047644b4279c65)
            }),
            s1: HonkTypes.G1Point({ 
               x: uint256(0x2ce64e16d53108062f97aa0401bd2ed9bb6a790237ec46a6898fa8c1555cc5ef),
               y: uint256(0x21b7d335458c6077531523dd0ed693b3b422cfa9eccaf85eab7760c75a48ead1)
            }),
            s2: HonkTypes.G1Point({ 
               x: uint256(0x029cac8dea1bf112ab390b44b2d2c9ef29f1c65de0920942414b8070f6efad2c),
               y: uint256(0x2e7aa4e6a1e2117053a93d2da881c441f42a4f636b301e018e069a28651b1470)
            }),
            s3: HonkTypes.G1Point({ 
               x: uint256(0x2e0faa4f3b3c457b18311461fca23254d78f7cd5670a4f2709231d8e6273ed86),
               y: uint256(0x23395c8a9af3004f4ee9e2d97a1ca68c05dd27a1089f7dc704bc532dd63eb790)
            }),
            s4: HonkTypes.G1Point({ 
               x: uint256(0x221b597a310ef6eb3602a0b61fa2e8195f7868b0114c1bf1932b78ef51dd21a5),
               y: uint256(0x28322e122f29d46ad4387ba7d580c618ff4dd4dc49463fc527774bbeae22b733)
            }),
            t1: HonkTypes.G1Point({ 
               x: uint256(0x1ddc9ef86584375e5998d9f6fc16a4e646dc315ab86b477abc2f18a723dc24f6),
               y: uint256(0x03a3b132ca6590c4ffdf35e1acd932da680a4247a55c88dd2284af78cb047906)
            }),
            t2: HonkTypes.G1Point({ 
               x: uint256(0x1e4cde3e410660193bacdf1db498ffb6bf1618c4d7b355415858d7d996e8bd03),
               y: uint256(0x18d7f0300f961521ead0cb3c81a2a43a2dea0fdcb17bd772aef6c7b908be4273)
            }),
            t3: HonkTypes.G1Point({ 
               x: uint256(0x0e77f28b07af551fea1ad81b304fd41013850e8b3539309c20bb2fa115289642),
               y: uint256(0x15f92fde2f0d7a77c27daeb397336220ffc07b99f710980253e84f8ae94afd4d)
            }),
            t4: HonkTypes.G1Point({ 
               x: uint256(0x2285ea4116ca00b673b2daadf596052b6d9ba6d231a4bea8af5a3c0f28c44aa4),
               y: uint256(0x076bf1e1f682badebfca083e25d808e8dae96372631c0721a7ee238c333a862a)
            }),
            id1: HonkTypes.G1Point({ 
               x: uint256(0x1cbed247616065c3f2b45abb0314c6f861537470e46752f2e65114ca5eb9aac3),
               y: uint256(0x1e7511bbd003b8ffa4b213681a3147c41686f4f928007b33ca2da4a8479b2a60)
            }),
            id2: HonkTypes.G1Point({ 
               x: uint256(0x25b9408732c140f9bb785d61e1318e87f6816907bac4313258ce21f055a3a049),
               y: uint256(0x1858b1ea2518684d51ad7426e432cf0b0f0d5ce7be0d7ed069e03b67107c3c82)
            }),
            id3: HonkTypes.G1Point({ 
               x: uint256(0x12295a5fdf40962b26228d40d091288afca8895921490ffd6929e80c52f7aa58),
               y: uint256(0x1f4bdf58c9bb5d780ee328cd5e6c539b4743f3bb85439a883e97b2625b366d7f)
            }),
            id4: HonkTypes.G1Point({ 
               x: uint256(0x2d3bff4ed714e0e1ccb5d4dde0004558520affed0bd43da90fc060491b311540),
               y: uint256(0x1bd260728c290b91501abfc00be02aace7cc1c7db895d8a2cfb02a11a29afed8)
            }),
            lagrangeFirst: HonkTypes.G1Point({ 
               x: uint256(0x0000000000000000000000000000000000000000000000000000000000000001),
               y: uint256(0x0000000000000000000000000000000000000000000000000000000000000002)
            }),
            lagrangeLast: HonkTypes.G1Point({ 
               x: uint256(0x28bf8c9eeae6946902ee08351768a3e4f67d812e6465f55f16bf69fad16cf46d),
               y: uint256(0x12dab1c326b33ea63ec6651324077c0ea2cb0ddfafd63fb8f9fbcc70bd53d7e0)
            })
        });
        return vk;
    }
}
