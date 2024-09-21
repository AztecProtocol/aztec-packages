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
            ql: Honk.G1Point({
                x: uint256(0x0b1acdcf739e1e6c27df046577122a292a77f4fcdf8056d8b8ae12f105d3a888),
                y: uint256(0x145dad3bdd9a262411aaa657129df49dbf44a63f510e9ab8191622c643ebd9bd)
            }),
            qr: Honk.G1Point({
                x: uint256(0x1940872f30b32522e26efd0fd4a642289bce2c56083e7a03af564c30969066d8),
                y: uint256(0x181fd173051ca19e37f09c42298c36d2e9834df50535d85d429f562352c0d924)
            }),
            qo: Honk.G1Point({
                x: uint256(0x2a1afa631e8b6ab8fb1444fb0154686a5a34c7a4ddae66bdc344e782a81382b3),
                y: uint256(0x0cfa0936a5e63e723a5c318c7461ddc22824ad0ee62fa00e2e8b92f9b3f1cdf6)
            }),
            q4: Honk.G1Point({
                x: uint256(0x1a01666b2e915221eb0c1ae6bf91394d18c73e6882dd1241d244f932678982ec),
                y: uint256(0x212b0436d2da1b4a6507142b794024ded58e3d41fdde2f95249405ffdd02b324)
            }),
            qm: Honk.G1Point({
                x: uint256(0x0dd29943b961b1c615ab22df0e5b567489a7c9a9ad3ac92ae281d68ca603326c),
                y: uint256(0x2a552165dc59dc5c5398e6b8c2227dc3f36ccdcc1250e7c9a8c1631c963aff2f)
            }),
            qc: Honk.G1Point({
                x: uint256(0x203785f30cf75ed2e8559faa797897174bca19ebcb44266c6bc87aee8dc86964),
                y: uint256(0x11ae3fbccf0c302ab29a8123b2ef631a659a3750d27df3eb7c492ae978ac3f07)
            }),
            qArith: Honk.G1Point({
                x: uint256(0x059453a86c23185b89783698e7da32ce59270611c312c82a16c42e83d66f3a11),
                y: uint256(0x23403bda1774d1e372f94dd86571d393290df9d27cc1f032a1a2ba3a02becb28)
            }),
            qDeltaRange: Honk.G1Point({
                x: uint256(0x189ec3e8c791a2933a4f188b2183c4bfeb9a2a8e51bb10a7571c243603dd3fce),
                y: uint256(0x00d30f1839bdf225d00e20bcf76adcf2bfc6ea98a4ca12b4f36c68f4a865fa59)
            }),
            qElliptic: Honk.G1Point({
                x: uint256(0x16b1166d95a8e2496eb12363dbfb9ca5aa5bc0975fc4994dc2c61cc0609d8eba),
                y: uint256(0x1aded54ecb6c2ec4fdeaef0f9e3b2dae5da1e1958d76b953b9e29efb1e8962b4)
            }),
            qAux: Honk.G1Point({
                x: uint256(0x1011b815b4505f86944621990bd81bd442780186904784572d50087942aa8607),
                y: uint256(0x24e575bf4641129d492759c66a4a5c1d3da80b647d4e67adfea20ab72eb69854)
            }),
            qLookup: Honk.G1Point({
                x: uint256(0x13a5f6d8f4de0f66dc7ea0d75efa7ae6632e6448c13bbbe5358412f7a36518d6),
                y: uint256(0x142fd8f3223785fbd36b380c6065215d16b821b3df4d86d5464f1bfff2a29544)
            }),
            qPoseidon2External: Honk.G1Point({
                x: uint256(0x02c909437bb59751312ce2208a2b367d3c9eaa8721d7671306c41ebd9843b3ba),
                y: uint256(0x1db8a23e0231ac4b008ccdb6f21aa37c59349a77b51d894217596f0ef543120c)
            }),
            qPoseidon2Internal: Honk.G1Point({
                x: uint256(0x19d898bac51355e0822e2aa6e6630494e47ea2476a0c4c15b6f03ce441f6c6d0),
                y: uint256(0x2add808f3d5b3c608ce5937fcd3c9c968ba56dbe5855e2f6d3e4bdd9d118d19b)
            }),
            s1: Honk.G1Point({
                x: uint256(0x0dd1eea7735fc4052df5a19e4859c59e50e3ab9cb3cc2accbd42ef8a1104449b),
                y: uint256(0x1541af79ad21fe21642a50d97899451c868b6d5d608431e5de6b0a730abe130d)
            }),
            s2: Honk.G1Point({
                x: uint256(0x21d9072c3474c1cfe1c2d96c098c4d9af4bb5d222944aa6470063f4a8b9b9770),
                y: uint256(0x137ad8c018449f48311b5394ac91a6b2f5c5e40c676216a299a3d501d69b1f7d)
            }),
            s3: Honk.G1Point({
                x: uint256(0x2c2fe61ccbf18af13d41950ef58f3a2a64d355657a4dfba8e9917e618ea8add4),
                y: uint256(0x2e7edf4dae50db17925e431d3198a39cb4bdc6f4e6e7d8d6163c972f4750a606)
            }),
            s4: Honk.G1Point({
                x: uint256(0x1825a30f42c7508e2ee2158d374dc626cf4149b745ba55d533181f418ac605aa),
                y: uint256(0x15d9b33a9612c0c8a55a75a827c0230656054765c7b37ba77a798b71a4766d1b)
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
                x: uint256(0x003bfa695fb125e2e815ae3565a2b7667fe2240edfd46c312fa6b6ed88226d3f),
                y: uint256(0x080c85e17835fce14e045eeb531ef2c287ad933a2ca7f35d3c7df03d0367fb9c)
            }),
            id2: Honk.G1Point({
                x: uint256(0x17662e6b69e1a67d8682a5c00b4d3c57c8f3ce7d82df027ba71c5031a946e070),
                y: uint256(0x14bd830834279aa5f4ff64181af68bef9121c6322d37d25b5490f60a83b755f9)
            }),
            id3: Honk.G1Point({
                x: uint256(0x05bc83edcd40f963c7f6983f1c6a993ce32ca97a6e45c076dc4e38195ba8560a),
                y: uint256(0x01239f42bab3bc0d1cc4194ca17fa76036ce2e4887a3dc499fe71da67d7af9a3)
            }),
            id4: Honk.G1Point({
                x: uint256(0x1bcbd59c8e9e24132d3d3dfb1eaf21fa4ed74e922bb4d44f3c8d22ebb50105da),
                y: uint256(0x147b021c1046d59dcc6b8be404ef2670f7e6f33a03dbaeef966c9bf3882324f4)
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
