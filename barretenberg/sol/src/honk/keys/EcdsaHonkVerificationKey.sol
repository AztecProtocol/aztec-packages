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
               x: uint256(0x092e1a5431e67f41abd28c9b103ef1fb90a93ff2474f2f5bd2550387fac4b6d6),
               y: uint256(0x272df56e1a1740f88fe789b1e63112068687fdc95ef7612024d550202bcbe41f)
            }),
            qr: Honk.G1Point({ 
               x: uint256(0x1d22d883b1f1bb07cbc1339682a92e3d96cf09e1c53a881fa283045587ce00fe),
               y: uint256(0x12fdb565b8d174d018dede5197be30c94835fa581ed969f40433f65a84222a4a)
            }),
            qo: Honk.G1Point({ 
               x: uint256(0x2d928f55abc1f8f5f9e29011fa8c802eb5a94989042b3d5560f013a779e5d193),
               y: uint256(0x1086b7bcf22b95fc94f063af74498dd4bac214e0459d68379a1008261358ddd7)
            }),
            q4: Honk.G1Point({ 
               x: uint256(0x0a4e034f2d3b73ae4eb6ff0db3fe8e7b0357e6dd375a3107d1e4d9eb5ceb1e5b),
               y: uint256(0x1266512c0da5b14ede1f1d5b80ad9dfa43b3c71b2c0bb11c9c123c70eabc62ad)
            }),
            qm: Honk.G1Point({ 
               x: uint256(0x1279a8faed8a7d782856985a20218fbcd73a8e8fb2574622210169b3b4eec159),
               y: uint256(0x063271b597aa97880532cff9e2ccea5a6bf13d947f4c310c39be452010d59cb9)
            }),
            qc: Honk.G1Point({ 
               x: uint256(0x1892791334caee5906d99a8c6dc6dc8636e0c667893b8cdd8067ee565028e396),
               y: uint256(0x2f86193c2778a4c33d144fbf2803260b1df44d4ad82390dea131bc2b11ad1855)
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
            qLookup: Honk.G1Point({ 
               x: uint256(0x0a15b7287881191263af5654587121b7c5db6c7fe8d390ab0454d0996a0b184b),
               y: uint256(0x2b5b0486da55ab0a673f7ca8d0fb5400a5462bef7a98730f34fe266bcf8b63ae)
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
               x: uint256(0x00b71575a57ba720e898927b0016053070edbf98f2a728b8fc2603da2a956d6b),
               y: uint256(0x2c0c228f484a09b78d65d8ff8ceb4ea876d13f0269ee5b0e5dc54a3373c09bdc)
            }),
            s2: Honk.G1Point({ 
               x: uint256(0x2812ff69d1e7205d246f4e1b27e4ad97e6825cbc6b8d94c7f4afc4a8d41f256a),
               y: uint256(0x29f88d4e5ff8d7304524f87f6a0fdf44eb36999e8592443764738204af151134)
            }),
            s3: Honk.G1Point({ 
               x: uint256(0x0889a6f2d947079d84b1cc1c90646b763e436020ca560ed5f9a31a515f1ff75f),
               y: uint256(0x0f8c22955fec144d6946d978eea7a404700cd973b09b1e97863a225e93f69d0b)
            }),
            s4: Honk.G1Point({ 
               x: uint256(0x24738d8ce55b0475f1dafe411756e60fb20594fcb362d251a8b19c97539c83f6),
               y: uint256(0x24ff3e562dbf315eda4d1aca54b46e34e7813894ddd7ff2adc4a584dca0b1456)
            }),
            t1: Honk.G1Point({ 
               x: uint256(0x2467210c5e67f86104a38488eff67d1252b8dc1de9c1f589ff66bfd5a4de1ed6),
               y: uint256(0x2126dbe4e3ee0d2240507870a9d85f0d90490efd7c69070f65a31dbff731889f)
            }),
            t2: Honk.G1Point({ 
               x: uint256(0x0c6e576e4ea74b4a4b2c70c36633e7c2d25222fa692417d283831aa00a578825),
               y: uint256(0x061c370923246a520c238c6cc2442ce9c0790350438fc20d0371682e92fda4e7)
            }),
            t3: Honk.G1Point({ 
               x: uint256(0x10e110ee17259e7746e26e882567409aad3fda44ea148dc6195eadfb80dc3884),
               y: uint256(0x23ac2d72dddf2f686d55cacac3d5503003d8a19acaab8d6cf00e3850600bf729)
            }),
            t4: Honk.G1Point({ 
               x: uint256(0x299f1dfcb8b0b56691dd560e5ee9f73c4d07fac967de3ecbbd0769128209cb9f),
               y: uint256(0x01598d24dc1b7a351ac26c8ca4d1d7539ef9b9252f7e664648f36adc1deed9ca)
            }),
            id1: Honk.G1Point({ 
               x: uint256(0x2ff83a26235c36a8ef7d2b5d60c94625cf0c6a8b7cb58c6bbc3279553d2c2a00),
               y: uint256(0x0abd08db895dc02deb80c3a652726cd860f2c296c87c1a7ce06c7000f42dad0e)
            }),
            id2: Honk.G1Point({ 
               x: uint256(0x2e5c0ffba0e108dc6d15b50ad578bba829d956d77d10c1cb65355e536583c6bb),
               y: uint256(0x14e7113a559d76c8aa2834f69aa8ebf9e89273753b590bbe1e7d331a9d4e55df)
            }),
            id3: Honk.G1Point({ 
               x: uint256(0x1ef45b584cf8f71846ef653d030919c53c4d6ba746a02381161f867c5c19a4c7),
               y: uint256(0x19f0cb5b94f4497352b81a1b6232fbb365af9e922cf54be78936a022ca7175a3)
            }),
            id4: Honk.G1Point({ 
               x: uint256(0x2f9e04d881e2ba569b6dfb991db9620f682bcdd7b07ef610fba9ffea33ce44f3),
               y: uint256(0x2da928074631459f8387befc89912d7c4d0c91538106a6dd5f3ff639bd890f35)
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
