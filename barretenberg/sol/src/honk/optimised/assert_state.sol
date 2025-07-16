// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.21;

uint256 constant N = 4096;
uint256 constant LOG_N = 12;
uint256 constant NUMBER_OF_PUBLIC_INPUTS = 17;
library HonkVerificationKey {
    function loadVerificationKey() internal pure returns (Honk.VerificationKey memory) {
        Honk.VerificationKey memory vk = Honk.VerificationKey({
            circuitSize: uint256(4096),
            logCircuitSize: uint256(12),
            publicInputsSize: uint256(17),
            ql: Honk.G1Point({
               x: uint256(0x26da9a1c96e115b786eddfc3bb7651db3b292be255a4acff0a9e1b01793d9d25),
               y: uint256(0x150dc3674f99f42e6bc566bfd4b0a9ada3a490a4a3b44b6147580f77faf193ec)
            }),
            qr: Honk.G1Point({
               x: uint256(0x25cd1288572ad7e374cc7d51a51df66fb5337dabc0366aa2b95c3a8a748f230a),
               y: uint256(0x19cb9c0e93cfb93c6192b81737d8fda5734df4a9f7863f4877b424b954c6bf91)
            }),
            qo: Honk.G1Point({
               x: uint256(0x1904de48ec6c7235c917773fadf78241f5d6ed0ec36ca3abed2f8a5ab17781c5),
               y: uint256(0x1af0acb5d80f158ce82a4c661d39b132d8d694b2dc7088d712d24d978ed9e7a2)
            }),
            q4: Honk.G1Point({
               x: uint256(0x057fff28e7165e4aea7be1e43029eafd8e7d664faf1cb3cf8b28b2c69af2cf64),
               y: uint256(0x3024e93f07a22ce55ee9357764f15ae9d789adf146bce86accd413788f20d994)
            }),
            qm: Honk.G1Point({
               x: uint256(0x2167c1a5b300f55c71dff5cecc1db5c86f6aa84b77a18fe47364be92f4b09e58),
               y: uint256(0x00888b45a5eaf37ceda8bedad1a14a7ee6961eaee401e3b5634aeea9dde64cfb)
            }),
            qc: Honk.G1Point({
               x: uint256(0x0e7991628b4d97e3454d7dc5bd2942738c18ea0d17c7d6e635706ff5e825d6e1),
               y: uint256(0x2dd66ce0a84fde8efa38845245f5cb2f3c28bd25aef452482dd760ad3fa72ccd)
            }),
            qArith: Honk.G1Point({
               x: uint256(0x1b8b2b79c9d890b12e41f93c10977846bf1434ae8fd0344ae9c49f86c0cb20b1),
               y: uint256(0x074072e572d7127be1018c3dbef76429489f899d8b8c445a2022da610e9bf4da)
            }),
            qDeltaRange: Honk.G1Point({
               x: uint256(0x0300663ac938bd6a9c66020aaff5716c5cf0841e8c7310f03248954f609af154),
               y: uint256(0x056bea83cf39779bde29dc650517dbe65318b8e0b3ae718cdfd024cceb5af847)
            }),
            qElliptic: Honk.G1Point({
               x: uint256(0x191ff5584ff8009607369f797b99fb08fa410ba17bd69eaebd6b9e01492ae48e),
               y: uint256(0x282398a44df904752366e7031e2ce7ab55cf72c074fa5409dfbd2f5c78cce0c8)
            }),
            qAux: Honk.G1Point({
               x: uint256(0x21d5334a4747a775618fcc947e7c9cbe849e4ac90f0361b9352ef86d02a9f410),
               y: uint256(0x13434060976085913bfc8cc21a4215a3bebd9e7d3e4acb9cb34c923f83c0c1db)
            }),
            qLookup: Honk.G1Point({
               x: uint256(0x0c4032c3079594eb75a8449d3d5ce8bc3661650d53f9b24d923d8f404cb0bbc9),
               y: uint256(0x1084d709650356d40f0158fd6da81f54eb5fe796a0ca89441369b7c24301f851)
            }),
            qPoseidon2External: Honk.G1Point({
               x: uint256(0x2c8c0953dcc7cc96a1c6140c23c4647607289ecf1b6e0db8ae1228a5bb91614b),
               y: uint256(0x22bab1b6d3616392f583c8f2aed8a30eed8b361f319a0fa69e81013c020973f7)
            }),
            qPoseidon2Internal: Honk.G1Point({
               x: uint256(0x2e9f808391ab789a4ab3535811011dbe1c6f8744e1d54c948f8d627d538fb965),
               y: uint256(0x089a480cc0c16c07ec1621b2917fbf6130f90c4da39e70a7213c6ebbf8768e05)
            }),
            s1: Honk.G1Point({
               x: uint256(0x10f81f86907852e61af5eff9a46756becde439e867b1f1994190e7c5bcb7c72a),
               y: uint256(0x2c7220fe9432309a230ab186dd38f26d5da2b85f3113175aa07436ceeac247d7)
            }),
            s2: Honk.G1Point({
               x: uint256(0x1fe2d8e69fd9722c59f837deea7171413f5bd73dfe9bc18b0b21f157d2958080),
               y: uint256(0x0c5c3d0d2b7645390bb2903d327e46e7ffd0db8343e8e97affbc5f4a618cebe9)
            }),
            s3: Honk.G1Point({
               x: uint256(0x196d306bae1399470f25d7720c4cc48eff168be290be388b850eea9a7059795a),
               y: uint256(0x0ebc3fb8b04e79a3c337138176deff6b646d023a57a5b9fb6c74c4d65faf0c9e)
            }),
            s4: Honk.G1Point({
               x: uint256(0x1c6843e63802ecd316fdd57916d7fb1376fb98d76e91e51d8c13df256e546259),
               y: uint256(0x171ea8a08aeeeee0f14ab9f76a48c84b966ec98789371d5fb5cfff8503ce7ed8)
            }),
            t1: Honk.G1Point({
               x: uint256(0x0450f8716810dff987300c3bc10a892b1c1c2637db3f8fecd9d8bb38442cc468),
               y: uint256(0x10005567f9eb3d3a97098baa0d71c65db2bf83f8a194086a4cca39916b578faf)
            }),
            t2: Honk.G1Point({
               x: uint256(0x103bcf2cf468d53c71d57b5c0ab31231e12e1ce3a444583203ea04c16ec69eb2),
               y: uint256(0x0c5d6e7a8b0b14d4ed8f51217ae8af4207277f4116e0af5a9268b38a5d34910b)
            }),
            t3: Honk.G1Point({
               x: uint256(0x187b9371870f579be414054241d418f5689db2f6cbfabe968378fd68e9b280c0),
               y: uint256(0x0964ab30f99cb72cc59d0f621604926cfebfcff535f724f619bb0e7a4853dbdb)
            }),
            t4: Honk.G1Point({
               x: uint256(0x132b76a71278e567595f3aaf837a72eb0ab515191143e5a3c8bd587526486628),
               y: uint256(0x2c6b2a0de0a3fefdfc4fb4f3b8381d2c37ccc495848c2887f98bfbaca776ca39)
            }),
            id1: Honk.G1Point({
               x: uint256(0x271aa5500efa6cae8cb47cf0b0317c58265f388473fdf38446cbf0dc84d96e0e),
               y: uint256(0x242673d20a1073ee28be699fb913388c09bbb0446856e9654e3184d3ad0429c3)
            }),
            id2: Honk.G1Point({
               x: uint256(0x2abb07ce267805f1ce2b9e7a24954d8cfa89401fed405bfb78d0de2be1e336e0),
               y: uint256(0x26e4347d01c80b8071421814f8076a645f9ef346b7815a26a1499c54840251bf)
            }),
            id3: Honk.G1Point({
               x: uint256(0x28c0acfecba62df92c5480b9226e57d9a879ab4ba16da777b036902955e87e99),
               y: uint256(0x031af1b9c39e13828b20b5175e412a979689ead924bbd9855fdfa89c06e9fdd6)
            }),
            id4: Honk.G1Point({
               x: uint256(0x113c1db47535873fd05bd4740d057e9e7883ba886d1c4dd862b928152f5511df),
               y: uint256(0x21930f74379704dc7aa088e48b7f6cc00164c4961261aef81e23739ba9399b51)
            }),
            lagrangeFirst: Honk.G1Point({
               x: uint256(0x0000000000000000000000000000000000000000000000000000000000000001),
               y: uint256(0x0000000000000000000000000000000000000000000000000000000000000002)
            }),
            lagrangeLast: Honk.G1Point({
               x: uint256(0x222a00990c265db917ccf6e4381cdea5d16200fda7af5265690cacda94ae7131),
               y: uint256(0x198a29bf1f6391c8487a4423a79256ef4609b87d44bedb68d26a4d64700443ea)
            })
        });
        return vk;
    }
}

import {BaseHonkVerifier as BASE} from "../BaseHonkVerifier.sol";

import {Honk} from "../HonkTypes.sol";

pragma solidity ^0.8.27;

interface IVerifier {
    function verify(bytes calldata _proof, bytes32[] calldata _publicInputs) external view returns (bool);
}

type Fr is uint256;

using {add as +} for Fr global;
using {sub as -} for Fr global;
using {mul as *} for Fr global;

using {exp as ^} for Fr global;
using {notEqual as !=} for Fr global;
using {equal as ==} for Fr global;

uint256 constant SUBGROUP_SIZE = 256;
uint256 constant MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617; // Prime field order
uint256 constant P = MODULUS;
Fr constant SUBGROUP_GENERATOR = Fr.wrap(0x07b0c561a6148404f086204a9f36ffb0617942546750f230c893619174a57a76);
Fr constant SUBGROUP_GENERATOR_INVERSE = Fr.wrap(0x204bd3277422fad364751ad938e2b5e6a54cf8c68712848a692c553d0329f5d6);
Fr constant MINUS_ONE = Fr.wrap(MODULUS - 1);
Fr constant ONE = Fr.wrap(1);
Fr constant ZERO = Fr.wrap(0);
// Instantiation

library FrLib {
    function from(uint256 value) internal pure returns (Fr) {
        return Fr.wrap(value % MODULUS);
    }

    function fromBytes32(bytes32 value) internal pure returns (Fr) {
        return Fr.wrap(uint256(value) % MODULUS);
    }

    function toBytes32(Fr value) internal pure returns (bytes32) {
        return bytes32(Fr.unwrap(value));
    }

    function invert(Fr value) internal view returns (Fr) {
        uint256 v = Fr.unwrap(value);
        uint256 result;

        // Call the modexp precompile to invert in the field
        assembly {
            let free := mload(0x40)
            mstore(free, 0x20)
            mstore(add(free, 0x20), 0x20)
            mstore(add(free, 0x40), 0x20)
            mstore(add(free, 0x60), v)
            mstore(add(free, 0x80), sub(MODULUS, 2))
            mstore(add(free, 0xa0), MODULUS)
            let success := staticcall(gas(), 0x05, free, 0xc0, 0x00, 0x20)
            if iszero(success) {
                revert(0, 0)
            }
            result := mload(0x00)
        }

        return Fr.wrap(result);
    }

    function pow(Fr base, uint256 v) internal view returns (Fr) {
        uint256 b = Fr.unwrap(base);
        uint256 result;

        // Call the modexp precompile to invert in the field
        assembly {
            let free := mload(0x40)
            mstore(free, 0x20)
            mstore(add(free, 0x20), 0x20)
            mstore(add(free, 0x40), 0x20)
            mstore(add(free, 0x60), b)
            mstore(add(free, 0x80), v)
            mstore(add(free, 0xa0), MODULUS)
            let success := staticcall(gas(), 0x05, free, 0xc0, 0x00, 0x20)
            if iszero(success) {
                revert(0, 0)
            }
            result := mload(0x00)
        }

        return Fr.wrap(result);
    }

    function div(Fr numerator, Fr denominator) internal view returns (Fr) {
        return numerator * invert(denominator);
    }

    function sqr(Fr value) internal pure returns (Fr) {
        return value * value;
    }

    function unwrap(Fr value) internal pure returns (uint256) {
        return Fr.unwrap(value);
    }

    function neg(Fr value) internal pure returns (Fr) {
        return Fr.wrap(MODULUS - Fr.unwrap(value));
    }
}

// Free functions
function add(Fr a, Fr b) pure returns (Fr) {
    return Fr.wrap(addmod(Fr.unwrap(a), Fr.unwrap(b), MODULUS));
}

function mul(Fr a, Fr b) pure returns (Fr) {
    return Fr.wrap(mulmod(Fr.unwrap(a), Fr.unwrap(b), MODULUS));
}

function sub(Fr a, Fr b) pure returns (Fr) {
    return Fr.wrap(addmod(Fr.unwrap(a), MODULUS - Fr.unwrap(b), MODULUS));
}

function exp(Fr base, Fr exponent) pure returns (Fr) {
    if (Fr.unwrap(exponent) == 0) return Fr.wrap(1);
    // Implement exponent with a loop as we will overflow otherwise
    for (uint256 i = 1; i < Fr.unwrap(exponent); i += i) {
        base = base * base;
    }
    return base;
}

function notEqual(Fr a, Fr b) pure returns (bool) {
    return Fr.unwrap(a) != Fr.unwrap(b);
}

function equal(Fr a, Fr b) pure returns (bool) {
    return Fr.unwrap(a) == Fr.unwrap(b);
}

uint256 constant CONST_PROOF_SIZE_LOG_N = 28;

uint256 constant NUMBER_OF_SUBRELATIONS = 27;
uint256 constant BATCHED_RELATION_PARTIAL_LENGTH = 8;
uint256 constant ZK_BATCHED_RELATION_PARTIAL_LENGTH = 9;
uint256 constant NUMBER_OF_ENTITIES = 40;
uint256 constant NUMBER_UNSHIFTED = 35;
uint256 constant NUMBER_TO_BE_SHIFTED = 5;
uint256 constant PAIRING_POINTS_SIZE = 16;

// Alphas are used as relation separators so there should be NUMBER_OF_SUBRELATIONS - 1
uint256 constant NUMBER_OF_ALPHAS = 26;

// ENUM FOR WIRES
enum WIRE {
    Q_M,
    Q_C,
    Q_L,
    Q_R,
    Q_O,
    Q_4,
    Q_LOOKUP,
    Q_ARITH,
    Q_RANGE,
    Q_ELLIPTIC,
    Q_AUX,
    Q_POSEIDON2_EXTERNAL,
    Q_POSEIDON2_INTERNAL,
    SIGMA_1,
    SIGMA_2,
    SIGMA_3,
    SIGMA_4,
    ID_1,
    ID_2,
    ID_3,
    ID_4,
    TABLE_1,
    TABLE_2,
    TABLE_3,
    TABLE_4,
    LAGRANGE_FIRST,
    LAGRANGE_LAST,
    W_L,
    W_R,
    W_O,
    W_4,
    Z_PERM,
    LOOKUP_INVERSES,
    LOOKUP_READ_COUNTS,
    LOOKUP_READ_TAGS,
    W_L_SHIFT,
    W_R_SHIFT,
    W_O_SHIFT,
    W_4_SHIFT,
    Z_PERM_SHIFT
}


// Transcript library to generate fiat shamir challenges
struct Transcript {
    // Oink
    Honk.RelationParameters relationParameters;
    Fr[NUMBER_OF_ALPHAS] alphas;
    Fr[CONST_PROOF_SIZE_LOG_N] gateChallenges;
    // Sumcheck
    Fr[CONST_PROOF_SIZE_LOG_N] sumCheckUChallenges;
    // Gemini
    Fr rho;
    Fr geminiR;
    // Shplonk
    Fr shplonkNu;
    Fr shplonkZ;
}

uint256 constant Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583; // EC group order. F_q


function bytes32ToString(bytes32 value) pure returns (string memory result) {
    bytes memory alphabet = "0123456789abcdef";

    bytes memory str = new bytes(66);
    str[0] = "0";
    str[1] = "x";
    for (uint256 i = 0; i < 32; i++) {
        str[2 + i * 2] = alphabet[uint8(value[i] >> 4)];
        str[3 + i * 2] = alphabet[uint8(value[i] & 0x0f)];
    }
    result = string(str);
}


// Fr utility

function bytesToFr(bytes calldata proofSection) pure returns (Fr scalar) {
    require(proofSection.length == 0x20, "invalid number of bytes to construct Fr scalar");
    scalar = FrLib.fromBytes32(bytes32(proofSection));
}

// EC Point utilities

function convertProofPoint(Honk.G1ProofPoint memory input) pure returns (Honk.G1Point memory point) {
    point = Honk.G1Point({x: input.x_0 | (input.x_1 << 136), y: input.y_0 | (input.y_1 << 136)});
}

function bytesToG1ProofPoint(bytes calldata proofSection) pure returns (Honk.G1ProofPoint memory point) {
    require(proofSection.length == 0x80, "invalid number of bytes to construct a G1 point");
    point = Honk.G1ProofPoint({
        x_0: uint256(bytes32(proofSection[0x00:0x20])),
        x_1: uint256(bytes32(proofSection[0x20:0x40])),
        y_0: uint256(bytes32(proofSection[0x40:0x60])),
        y_1: uint256(bytes32(proofSection[0x60:0x80]))
    });
}

function negateInplace(Honk.G1Point memory point) pure returns (Honk.G1Point memory) {
    point.y = (Q - point.y) % Q;
    return point;
}

function pairing(Honk.G1Point memory rhs, Honk.G1Point memory lhs) view returns (bool decodedResult) {
    bytes memory input = abi.encodePacked(
        rhs.x,
        rhs.y,
        // Fixed G2 point
        uint256(0x198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2),
        uint256(0x1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed),
        uint256(0x090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b),
        uint256(0x12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa),
        lhs.x,
        lhs.y,
        // G2 point from VK
        uint256(0x260e01b251f6f1c7e7ff4e580791dee8ea51d87a358e038b4efe30fac09383c1),
        uint256(0x0118c4d5b837bcc2bc89b5b398b5974e9f5944073b32078b7e231fec938883b0),
        uint256(0x04fc6369f7110fe3d25156c1bb9a72859cf2a04641f99ba4ee413c80da6a5fe4),
        uint256(0x22febda3c0c0632a56475b4214e5615e11e6dd3f96e6cea2854a87d4dacc5e55)
    );

    (bool success, bytes memory result) = address(0x08).staticcall(input);
    decodedResult = success && abi.decode(result, (bool));
}


// Field arithmetic libraries - prevent littering the code with modmul / addmul




contract HonkVerifier is BASE(N, LOG_N, NUMBER_OF_PUBLIC_INPUTS) {
     function loadVerificationKey() internal pure override returns (Honk.VerificationKey memory) {
       return HonkVerificationKey.loadVerificationKey();
    }
}
