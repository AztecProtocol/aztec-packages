// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.21;

import {Honk} from "../HonkTypes.sol";

uint256 constant N = 1048576;
uint256 constant LOG_N = 20;
uint256 constant NUMBER_OF_PUBLIC_INPUTS = 16;

library RecursiveHonkVerificationKey {
    function loadVerificationKey() internal pure returns (Honk.VerificationKey memory) {
        Honk.VerificationKey memory vk = Honk.VerificationKey({
            circuitSize: uint256(1048576),
            logCircuitSize: uint256(20),
            publicInputsSize: uint256(16),
            ql: Honk.G1Point({
                x: uint256(0x2d26dcedf30775b10b7b5d23a575efd46e95045fbcafedfb05e144c2aa7edf6d),
                y: uint256(0x189bf6c6697af3d3a2067f655f5216cd2e97938d4797a6bfba0691fc0277fada)
            }),
            qr: Honk.G1Point({
                x: uint256(0x0e7c54b4edab80856f4fabea396847d9c0e0dfb108d12f7cca3f66af637e6f55),
                y: uint256(0x03a2c15b0527f285aef195962b9147ca4d6e551bc514a44a2d1bcb172dc979c6)
            }),
            qo: Honk.G1Point({
                x: uint256(0x16f7603dff1b4de3a408ababf5c1f0cb6d681200a68b908fdae639e6f7ff4511),
                y: uint256(0x155e43df56ff09f3173964d4f16102bc685f0ded024a8919cf2a89b85cabe33f)
            }),
            q4: Honk.G1Point({
                x: uint256(0x1959af5df227eb226bdc5b28b150e3cfe698059a0280660afea908430493014e),
                y: uint256(0x00a75ddb7c78411a5ec15357c7ae6f62847d96161cfafdc7d9d669e8e0231419)
            }),
            qm: Honk.G1Point({
                x: uint256(0x24b9ffc894adf6cd9e7cc8b4de6fff0f0ca7f9d3a2fdf0871075ec23fd301261),
                y: uint256(0x23075f89aab092a5d5b2d6642f3b3275a6181ef9ef07087ab3e0a6ea629cc540)
            }),
            qc: Honk.G1Point({
                x: uint256(0x1a3d885069f88956a92a8345c0646777335ca800aab1e35f317d855e99aa531c),
                y: uint256(0x0c47e6336854b472d15d75d14e1585fbaaf66671bf5ca30486f0ec15b4f574c2)
            }),
            qLookup: Honk.G1Point({
                x: uint256(0x17c6d9d50e48678a2ac344538de4c7ece661d9ddf8d6ce71e63ee377b120f70f),
                y: uint256(0x19c51b736e4c5a7d8380246160d19aad54bcdd8f21bebc775e9dfb36b9a73d45)
            }),
            qArith: Honk.G1Point({
                x: uint256(0x2499cdf236366c4d57c2f73086e3611506d2001765312f0a6e7781b2ff84fbd8),
                y: uint256(0x2e8dc357c969714b338e6541baf9652f50b2974dfb6190d3e5da521dcdb08af9)
            }),
            qDeltaRange: Honk.G1Point({
                x: uint256(0x00fbf43060f5b779c78e58b0c15e12923a62045d9d876f2cdbd0d083ef9c45f7),
                y: uint256(0x1ef290eab9cc24a075994fbbe42cd68c1f2fd36950d007d99e2e61a271cf1c13)
            }),
            qElliptic: Honk.G1Point({
                x: uint256(0x1c26f9d337c25239c45f67a8f00754bb6aaa64a14394b2a6cf0f3c8298d93ade),
                y: uint256(0x01bc640aa67f45fcc4c61c921fe40299ea3a9440f7496d20a87f3ba721afd3bd)
            }),
            qMemory: Honk.G1Point({
                x: uint256(0x06704e80c73d522a6c0d271d0d7be32ccf123e5c295d32eb9b01cd469320c62f),
                y: uint256(0x22eaaba8da07ab035b5dd26d0707400070c1cd433378309e45000c9f13c7624f)
            }),
            qNnf: Honk.G1Point({
                x: uint256(0x02000475a782569f2d194386cce38a6d710be971a1a81bd8c92c404f87f05a43),
                y: uint256(0x2cebd5ca539168fbef16a07b91007906d9b98c6e03fb0ad6a4a25bfe6b05d7dd)
            }),
            qPoseidon2External: Honk.G1Point({
                x: uint256(0x2ee773f75be2976838a34e6d82c7132f5983544e2f3db31c1dfa90bf7d47de02),
                y: uint256(0x2498bf496ac37d196ca51551ec3cdc07249c6082fb6fc7d7f0dfd37a721bafda)
            }),
            qPoseidon2Internal: Honk.G1Point({
                x: uint256(0x11e082b6336724c75334ad632e19a063ab65e853a19a588a70c02032fe0a4a76),
                y: uint256(0x13ebf7e86554cd89006ed3914506c6d5328068d5e06c73af401184781c4040f8)
            }),
            s1: Honk.G1Point({
                x: uint256(0x067dc6b4dbb9968f7928c3b498bfd76ec79b803713ca25af9ca521d2c8039707),
                y: uint256(0x08ff2df2516f5723801a6cb4be752cffe45fba164234dc251981fd249a39970c)
            }),
            s2: Honk.G1Point({
                x: uint256(0x045c8d3b6bd01cd90f5a09ef7ea60ff0ce6495f648caeb8146ace7384830411d),
                y: uint256(0x0ac548f97b9872bf3ef717610125de3ddacc7d5f7e7662b3d4ebf05d2eb1ed1d)
            }),
            s3: Honk.G1Point({
                x: uint256(0x0138d46260c1914f238042755e184558919a30dad7bf5801ed2400d906be3669),
                y: uint256(0x133a11205297d8f4ab8f890a0e373c1d579cb06e8e8f67356c51484be8937416)
            }),
            s4: Honk.G1Point({
                x: uint256(0x1ef60cf15852c1c439179a1de8d6270803f387111a2532d45a8332d838570267),
                y: uint256(0x2679530b38dcc0d04eb4b7b14f44ec44aa1dfb3499671a277e9214537097390f)
            }),
            t1: Honk.G1Point({
                x: uint256(0x1f1156b93b4396e0dac3bd312fdc94243cf3e0cfba606d27d5999f4927ff92b3),
                y: uint256(0x116a7935196d39ea9178a285c53a6b419d9961d76a65ed28914ca5cc3ffd2433)
            }),
            t2: Honk.G1Point({
                x: uint256(0x23aebc5efc1d0e6d03030b242308fdf369409c76a0245d4f389193b554c30065),
                y: uint256(0x19f38f8e7cf18f375d75db06fca92a0cbfc1214af084c189478e34dc04c77419)
            }),
            t3: Honk.G1Point({
                x: uint256(0x15642d62fc17d119ba4afb77ab424e0a771b5bbb501c75790a1a4e2906931045),
                y: uint256(0x21cea98314ec6efc5f8f1f648f42a7a5c1396036397af54a729801cc1c37d4e2)
            }),
            t4: Honk.G1Point({
                x: uint256(0x1f3bd0ebf0709ac30745d0dafb183cdd5b4a42e59fe1e447cad24659049d13a7),
                y: uint256(0x05900180ddd1cec6e340c70c9bff6f16c2efd51d298fee5fce4355fc26890195)
            }),
            id1: Honk.G1Point({
                x: uint256(0x2bd6a3cf99e1dc7eaef20cef7f35ea393999a1d7136a044a395481b6ba11e8e3),
                y: uint256(0x12641696d74551bbb1dada90b63265e871a4828d3e075a77631600fe4b925bea)
            }),
            id2: Honk.G1Point({
                x: uint256(0x23ead4e558c7899cf02f54cea73220ce6a5a960499f3e0b83d4ccd2123177bad),
                y: uint256(0x1b006d51b0a636626605560a5eaa3e3acbe0fca9eb9c29018a20ac7ba9d0728a)
            }),
            id3: Honk.G1Point({
                x: uint256(0x293fb43acbd84cb4f8ea0fa4a8484f6ee56221100d6fa19b1f26d237bf02d1e5),
                y: uint256(0x04ea174248f7372df94bdf7f8475551bb24db92eaedeb8c6311bfa298e7ae897)
            }),
            id4: Honk.G1Point({
                x: uint256(0x12ff4a53b6d2e5a175ed657c757338ceb47fef1e725f65cede468374a416f108),
                y: uint256(0x2da5490444810e3fb35d5fec5c27941833a71033794492a4940ec248b492bfbd)
            }),
            lagrangeFirst: Honk.G1Point({
                x: uint256(0x0000000000000000000000000000000000000000000000000000000000000001),
                y: uint256(0x0000000000000000000000000000000000000000000000000000000000000002)
            }),
            lagrangeLast: Honk.G1Point({
                x: uint256(0x0165fcea6ebe5211b0ff2e488af14201f2ff309861695f95625be884ab65e2da),
                y: uint256(0x2a43ae04d425e180c906d436a1c57beac2c613d6f5beeb9fc35e89fd24164d14)
            })
        });
        return vk;
    }
}
