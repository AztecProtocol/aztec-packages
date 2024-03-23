import {HonkTypes} from "./HonkVerifierTypes.sol";
import {IVerifier} from "../interfaces/IVerifier.sol";

// TODO: this should be somewhat dynamic across the board
import {Add2HonkVerificationKey} from "./keys/Add2HonkVerificationKey.sol";

import "forge-std/console.sol";
import "forge-std/console2.sol";

// Easier Field arithmetic library TODO: fix up documentation and describe what this does
import {Fr, FrLib} from "./Fr.sol";

// ENUM FOR WIRES
enum WIRE {
    Q_C,
    Q_L,
    Q_R,
    Q_O,
    Q_4,
    Q_M,
    Q_ARITH,
    Q_SORT,
    Q_ELLIPTIC,
    Q_AUX,
    Q_LOOKUP,
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
    SORTED_ACCUM,
    Z_PERM,
    Z_LOOKUP,
    TABLE_1_SHIFT,
    TABLE_2_SHIFT,
    TABLE_3_SHIFT,
    TABLE_4_SHIFT,
    W_L_SHIFT,
    W_R_SHIFT,
    W_O_SHIFT,
    W_4_SHIFT,
    SORTED_ACCUM_SHIFT,
    Z_PERM_SHIFT,
    Z_LOOKUP_SHIFT
}

/// Smart contract verifier of honk proofs
contract HonkVerifier is IVerifier {
    /// Plan of action
    /// We want to implement the non goblinised version of the protocol

    /// 0. Implement loading the verification key

    /// 1. Generate challenges
    /// 2. Perform the public inputs delta calculations

    /// 3. Implement the sumcheck verifier
    /// 4. Implement the zero morph verifier

    // TODO: increase this number accordingly
    uint256 internal constant NUMBER_OF_SUBRELATIONS = 17;
    uint256 internal constant BATCHED_RELATION_PARTIAL_LENGTH = 7;
    uint256 internal constant NUMBER_OF_ENTITIES = 43;
    Fr internal constant GRUMPKIN_CURVE_B_PARAMETER_NEGATED = Fr.wrap(17); // -(-17) 

    uint256 constant Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583; // EC group order
    uint256 constant P = 21888242871839275222246405745257275088548364400416034343698204186575808495617; // Prime field order

    /// Log of the circuit size - precomputed
    uint256 constant LOG_N = 5;

    struct ProofParameters {
        uint256 logCircuitSize;
    }

    struct TranscriptParameters {
        // Relation Challenges
        Fr[NUMBER_OF_SUBRELATIONS] alphas;
        Fr[LOG_N] gateChallenges;
        Fr[LOG_N] sumCheckUChallenges;

        Fr eta;
        
        // perm challenges
        Fr beta;
        Fr gamma;

        Fr rho;

        // Zero morph
        Fr zmX;
        Fr zmY;
        Fr zmZ;
        // TODO: Zero morph quotient
        Fr zmQuotient;

        Fr publicInputsDelta;
        Fr lookupGrandProductDelta;
    }

    /// Check how the challenges are calculated on the otherside
    function loadVerificationKey() internal view returns (HonkTypes.VerificationKey memory) {
        // Load the verification key -> this can be hardcoded
        return Add2HonkVerificationKey.loadVerificationKey();
    }

    function bytes32ToString(bytes32 value) public pure returns(string memory) {
    bytes memory alphabet = "0123456789abcdef";

    bytes memory str = new bytes(66);
    str[0] = '0';
    str[1] = 'x';
    for (uint i = 0; i < 32; i++) {
        str[2+i*2] = alphabet[uint8(value[i] >> 4)];
        str[3+i*2] = alphabet[uint8(value[i] & 0x0f)];
    }
    return string(str);
}

    function logG1(string memory name, HonkTypes.G1ProofPoint memory point) internal pure {
        // TODO: convert both to hex before printing to line up with cpp
        string memory x_0 = bytes32ToString(bytes32(point.x_0));
        string memory x_1 = bytes32ToString(bytes32(point.x_1));
        string memory y_0 = bytes32ToString(bytes32(point.y_0));
        string memory y_1 = bytes32ToString(bytes32(point.y_1));

        string memory message = string(abi.encodePacked(name, " x: ", x_0, x_1, " y: ",  y_0, y_1));
        console2.log(message);
    }

    function logUint(string memory name, uint256 value) internal pure {
        string memory as_hex = bytes32ToString(bytes32(value));
        console2.log(name, as_hex);
    }

    function logFr(string memory name, Fr value) internal pure {
        string memory as_hex = bytes32ToString(bytes32(Fr.unwrap(value)));
        console2.log(name, as_hex);
    }

    function logFr(string memory name, uint256 i, Fr value) internal pure {
        string memory as_hex = bytes32ToString(bytes32(Fr.unwrap(value)));
        console2.log(name, i, as_hex);
    }

    function loadProof(bytes calldata proof) internal view returns (HonkTypes.Proof memory) {
        // TODO: mod all of the points by q!!
        HonkTypes.Proof memory p;

        // NOTE: Start of eta challenege

        // Metadata
        p.circuitSize = uint256(bytes32(proof[0x00:0x20]));
        console.log("circuitSize");
        console.log(p.circuitSize);
        p.publicInputsSize = uint256(bytes32(proof[0x20:0x40]));
        console.log("publicInputsSize");
        console.log(p.publicInputsSize);
        p.publicInputsOffset = uint256(bytes32(proof[0x40:0x60]));
        console.log("publicInputsOffset");
        console.log(p.publicInputsOffset);

        // TODO: Assset sizes are the same as vk - maybe not required actually

        // Commitments
        p.w1 = HonkTypes.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x60:0x80])), x_1: uint256(bytes32(proof[0x80:0xa0])),
            y_0: uint256(bytes32(proof[0xa0:0xc0])), y_1: uint256(bytes32(proof[0xc0:0xe0]))});

        logG1("w1", p.w1);
        p.w2 = HonkTypes.G1ProofPoint({
            x_0: uint256(bytes32(proof[0xe0:0x100])), x_1: uint256(bytes32(proof[0x100:0x120])), 
            y_0: uint256(bytes32(proof[0x120:0x140])), y_1: uint256(bytes32(proof[0x140:0x160]))});
        logG1("w2", p.w2);
        p.w3 = HonkTypes.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x160:0x180])), x_1: uint256(bytes32(proof[0x180:0x1a0])),
            y_0: uint256(bytes32(proof[0x1a0:0x1c0])), y_1: uint256(bytes32(proof[0x1c0:0x1e0]))});
        logG1("w3", p.w3);

        // Lookup / Permutation Helper Commitments
        p.sortedAccum =
            HonkTypes.G1ProofPoint({
                x_0: uint256(bytes32(proof[0x1e0:0x200])), x_1: uint256(bytes32(proof[0x200:0x220])),
                y_0: uint256(bytes32(proof[0x220:0x240])), y_1: uint256(bytes32(proof[0x240:0x260]))
            });
        logG1("sortedAccum", p.sortedAccum);
        p.w4 = HonkTypes.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x260:0x280])), x_1: uint256(bytes32(proof[0x280:0x2a0])),
            y_0: uint256(bytes32(proof[0x2a0:0x2c0])), y_1: uint256(bytes32(proof[0x2c0:0x2e0]))
        });
        logG1("w4", p.w4);

        p.zPerm = HonkTypes.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x2e0:0x300])), x_1: uint256(bytes32(proof[0x300:0x320])),
            y_0: uint256(bytes32(proof[0x320:0x340])), y_1: uint256(bytes32(proof[0x340:0x360]))
        });
        logG1("zperm", p.zPerm);

        p.zLookup =
            HonkTypes.G1ProofPoint({
                x_0: uint256(bytes32(proof[0x360:0x380])), x_1: uint256(bytes32(proof[0x380:0x3a0])),
                y_0: uint256(bytes32(proof[0x3a0:0x3c0])), y_1: uint256(bytes32(proof[0x3c0:0x3e0]))
            });
        logG1("zLookup", p.zLookup);

        // TEMP the boundary of what has already been read
        uint256 boundary = 0x3e0;

        // Sumcheck univariates
        // TODO: in this case we know what log_n is - so we hard code it, we would want this to be included in
        // a cpp template for different circuit sizes
        for (uint256 i = 0; i < LOG_N; i++) {
            // The loop boundary of i, this will shift forward on each evaluation
            uint256 loop_boundary = boundary + (i * 0x20 * BATCHED_RELATION_PARTIAL_LENGTH);

            console.log(i);
            for (uint256 j = 0; j < BATCHED_RELATION_PARTIAL_LENGTH; j++) {

                uint256 start = loop_boundary + (j * 0x20);
                uint256 end = start + 0x20;
                p.sumcheckUnivariates[i][j] = FrLib.fromBytes32(bytes32(proof[start:end]));

                string memory name = string(abi.encodePacked("sumcheckUnivariates", i, " ", j));
                logFr(name, p.sumcheckUnivariates[i][j]);

            }
        }

        boundary = boundary + (LOG_N * BATCHED_RELATION_PARTIAL_LENGTH * 0x20);
        // Sumcheck evaluations
        for (uint256 i = 0; i < NUMBER_OF_ENTITIES; i++) {
            uint256 start = boundary + (i * 0x20);
            uint256 end = start + 0x20;
            p.sumcheckEvaluations[i] = FrLib.fromBytes32(bytes32(proof[start:end]));

            logFr("sumcheck evaluations", i, p.sumcheckEvaluations[i]);
        }

        boundary = boundary + (NUMBER_OF_ENTITIES * 0x20);
        // Zero morph Commitments
        for (uint256 i = 0; i < LOG_N; i++) {

            // Explicitly stating the x0, x1, y0, y1 start and end boundaries to make the calldata slicing bearable
            uint256 xStart = boundary + (i * 0x80);
            uint256 xEnd = xStart + 0x20;

            uint256 x1Start = xEnd;
            uint256 x1End = x1Start + 0x20;

            uint256 yStart = x1End;
            uint256 yEnd = yStart + 0x20;

            uint256 y1Start = yEnd;
            uint256 y1End = y1Start + 0x20;

            p.zmCqs[i] =
                HonkTypes.G1ProofPoint({
                    x_0: uint256(bytes32(proof[xStart:xEnd])), x_1: uint256(bytes32(proof[x1Start:x1End])), 
                    y_0: uint256(bytes32(proof[yStart:yEnd])), y_1: uint256(bytes32(proof[y1Start:y1End]))
                });
            console.log(i);
            logG1("zmCqs", p.zmCqs[i]);
        }

        boundary = boundary + (LOG_N * 0x80);

        // TODO: the hardcoded figures here will be wrong
        // Probably worth just preprocessing these
        p.zmCq = HonkTypes.G1ProofPoint({
            x_0: uint256(bytes32(proof[boundary:boundary + 0x20])), x_1: uint256(bytes32(proof[boundary + 0x20:boundary + 0x40])),
            y_0: uint256(bytes32(proof[boundary + 0x40:boundary + 0x60])), y_1: uint256(bytes32(proof[boundary + 0x60:boundary + 0x80]))
        });

        logG1("zmCq", p.zmCq);

        p.zmPi = HonkTypes.G1ProofPoint({
            x_0: uint256(bytes32(proof[boundary + 0x80:boundary + 0xa0])), x_1: uint256(bytes32(proof[boundary + 0xa0:boundary + 0xc0])),
            y_0: uint256(bytes32(proof[boundary + 0xc0:boundary + 0xe0])), y_1: uint256(bytes32(proof[boundary + 0xe0:boundary + 0x100]))
        });

        logG1("zmPi", p.zmPi);

        return p;
    }

    error PublicInputsLengthWrong();

    // TODO(md): I would perfer the publicInputs to be uint256
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) override view public returns (bool) {
        HonkTypes.VerificationKey memory vk = loadVerificationKey();
        HonkTypes.Proof memory p = loadProof(proof);

        console.log("We have loaded the proof");

        if (vk.publicInputsSize != publicInputs.length) {
            revert PublicInputsLengthWrong();
        }

        // Perform each of the rounds
        TranscriptParameters memory tp = computeChallenges(p, vk, publicInputs);

        // Compute the public input delta
        tp.publicInputsDelta =
            computePublicInputDelta(publicInputs, tp.beta, tp.gamma, vk.circuitSize, p.publicInputsOffset);

        tp.lookupGrandProductDelta = computeLookupGrandProductDelta(tp.beta, tp.gamma, vk.circuitSize);

        // Sumcheck
        bool success = verifySumcheck(p, tp);

    }

    function computeChallenges(
        HonkTypes.Proof memory proof,
        HonkTypes.VerificationKey memory vk,
        bytes32[] calldata publicInputs
    ) internal view returns (TranscriptParameters memory) {
        TranscriptParameters memory tp;

        // TODO: move eta into its own function
        // We generate the first challenge by hashing the public inputs

        tp.eta = generateEtaChallenge(proof, publicInputs);

        // We generate the beta and gamma challenges by appending eta with the sorted_accumulator and w4
        (tp.beta, tp.gamma) = generateBetaAndGammaChallenges(tp.eta, proof);

        // WORKTODO: there are more items pushed to the sumcheck challenges 1
        tp.alphas = generateAlphaChallenges(tp.gamma, proof);

        tp.gateChallenges = generateGateChallenges(tp.alphas[NUMBER_OF_SUBRELATIONS - 1]);

        tp.sumCheckUChallenges = generateSumcheckChallenges(proof, tp.gateChallenges[LOG_N - 1]);
        tp.rho = generateRhoChallenge(proof, tp.sumCheckUChallenges[LOG_N - 1]);

        tp.zmY =  generateZMYChallenge(tp.rho, proof);

        (tp.zmX, tp.zmZ) = generateZMXZChallenges(tp.zmY, proof);
    
        return tp;
    }

    function generateEtaChallenge(HonkTypes.Proof memory proof, bytes32[] calldata publicInputs) internal view returns (Fr) {
        // publicInputs.length = 3 - this will be templated in the end!!!
        // TODO(md): the 12 here will need to be halved when we fix the transcript to not be over field elements
        // TODO(md): the 3 here is hardcoded for the number of public inputs - this will need to be generated / use asm
        // TODO: use assembly 
        bytes32[3 + 3 + 12] memory round0;
        round0[0] = bytes32(proof.circuitSize);
        round0[1] = bytes32(proof.publicInputsSize);
        round0[2] = bytes32(proof.publicInputsOffset);
        for (uint256 i = 0; i < publicInputs.length; i++) {
            round0[3 + i] = bytes32(publicInputs[i]);
        }

        // Create the first challenge
        // Note: w4 is added to the challenge later on
        // TODO: UPDATE ALL VALUES IN HERE
        round0[3 + publicInputs.length] = bytes32(proof.w1.x_0);
        round0[3 + publicInputs.length + 1] = bytes32(proof.w1.x_1);
        round0[3 + publicInputs.length + 2] = bytes32(proof.w1.y_0);
        round0[3 + publicInputs.length + 3] = bytes32(proof.w1.y_1);
        round0[3 + publicInputs.length + 4] = bytes32(proof.w2.x_0);
        round0[3 + publicInputs.length + 5] = bytes32(proof.w2.x_1);
        round0[3 + publicInputs.length + 6] = bytes32(proof.w2.y_0);
        round0[3 + publicInputs.length + 7] = bytes32(proof.w2.y_1);
        round0[3 + publicInputs.length + 8] = bytes32(proof.w3.x_0);
        round0[3 + publicInputs.length + 9] = bytes32(proof.w3.x_1);
        round0[3 + publicInputs.length + 10] = bytes32(proof.w3.y_0);
        round0[3 + publicInputs.length + 11] = bytes32(proof.w3.y_1);
        
        for (uint256 i = 0; i < 18; i++) {
            console.logBytes32(round0[i]);
        }

        Fr eta = FrLib.fromBytes32(keccak256(abi.encodePacked(round0)));
        logFr("eta", eta);
        return eta;
    }

    function generateBetaAndGammaChallenges(Fr previousChallenge, HonkTypes.Proof memory proof) internal view returns (Fr, Fr) {
        // TODO(md): adjust round size when the proof points are generated correctly - 5
        bytes32[9] memory round1;
        round1[0] = FrLib.toBytes32(previousChallenge);
        round1[1] = bytes32(proof.sortedAccum.x_0);
        round1[2] = bytes32(proof.sortedAccum.x_1);
        round1[3] = bytes32(proof.sortedAccum.y_0);
        round1[4] = bytes32(proof.sortedAccum.y_1);
        round1[5] = bytes32(proof.w4.x_0);
        round1[6] = bytes32(proof.w4.x_1);
        round1[7] = bytes32(proof.w4.y_0);
        round1[8] = bytes32(proof.w4.y_1);

        Fr beta = FrLib.fromBytes32(keccak256(abi.encodePacked(round1)));
        logFr("beta", beta);
        Fr gamma = FrLib.fromBytes32(keccak256(abi.encodePacked(beta)));
        logFr("gamma", gamma);
        return (beta, gamma);
    }


    // Alpha challenges non-linearise the gate contributions
    function generateAlphaChallenges(Fr previousChallenge, HonkTypes.Proof memory proof) 
        internal view
        returns (Fr[NUMBER_OF_SUBRELATIONS] memory)
    {
        Fr[NUMBER_OF_SUBRELATIONS] memory alphas;

        // Generate the original sumcheck alpha 0 by hashing zPerm and zLookup
        // TODO(md): 5 post correct proof size fix
        // TODO: type consistency
        uint256[9] memory alpha0;
        alpha0[0] = Fr.unwrap(previousChallenge);
        alpha0[1] = proof.zPerm.x_0;
        alpha0[2] = proof.zPerm.x_1;
        alpha0[3] = proof.zPerm.y_0;
        alpha0[4] = proof.zPerm.y_1;
        alpha0[5] = proof.zLookup.x_0;
        alpha0[6] = proof.zLookup.x_1;
        alpha0[7] = proof.zLookup.y_0;
        alpha0[8] = proof.zLookup.y_1;

        alphas[0] = FrLib.fromBytes32(keccak256(abi.encodePacked(alpha0)));
        logFr("alpha0", alphas[0]);

        Fr prevChallenge = alphas[0];
        for (uint256 i = 1; i < NUMBER_OF_SUBRELATIONS; i++) {
            prevChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(Fr.unwrap(prevChallenge))));
            alphas[i] = prevChallenge;
            logFr("alpha", alphas[i]);
        }
        return alphas;
    }

    function generateGateChallenges(Fr previousChallenge) internal view returns (Fr[LOG_N] memory) {
        Fr[LOG_N] memory gateChallanges;
        for (uint256 i = 0; i < LOG_N; i++) {
            previousChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(Fr.unwrap(previousChallenge))));
            gateChallanges[i] = previousChallenge;
            logFr("gate", gateChallanges[i]);
        }
        return gateChallanges;
    }

    function generateSumcheckChallenges(HonkTypes.Proof memory proof, Fr prevChallenge)
        internal view
        returns (Fr[LOG_N] memory)
    {
        Fr[LOG_N] memory sumcheckChallenges;
        for (uint256 i = 0; i < LOG_N; i++) {
            Fr[BATCHED_RELATION_PARTIAL_LENGTH + 1] memory univariateChal;
            univariateChal[0] = prevChallenge;

            // TODO(opt): memcpy
            for (uint256 j = 0; j < BATCHED_RELATION_PARTIAL_LENGTH; j++) {
                univariateChal[j + 1] = proof.sumcheckUnivariates[i][j];
            }

            // TOOD(md): not too sure about the encode here
            sumcheckChallenges[i] = FrLib.fromBytes32(keccak256(abi.encodePacked(univariateChal)));
            prevChallenge = sumcheckChallenges[i];
            logFr("sumcheck chal", sumcheckChallenges[i]);
        }

        return sumcheckChallenges;
    }

    function generateRhoChallenge(HonkTypes.Proof memory proof, Fr prevChallenge) internal view returns (Fr) {
        Fr[NUMBER_OF_ENTITIES + 1] memory rhoChallengeElements;
        rhoChallengeElements[0] = prevChallenge;

        // TODO: memcpy
        for (uint256 i = 0; i < NUMBER_OF_ENTITIES; i++) {
            rhoChallengeElements[i + 1] = proof.sumcheckEvaluations[i];
        }

        Fr rho = FrLib.fromBytes32(keccak256(abi.encodePacked(rhoChallengeElements)));

        logFr("rho", rho);
        return rho;
    }

    function generateZMYChallenge(Fr previousChallenge, HonkTypes.Proof memory proof) internal view returns (Fr) {
        uint256[LOG_N * 4 + 1] memory zmY;
        zmY[0] = Fr.unwrap(previousChallenge);

        for (uint256 i; i < LOG_N; ++i) {
            zmY[1 + i * 4] = proof.zmCqs[i].x_0;
            zmY[2 + i * 4] = proof.zmCqs[i].x_1;
            zmY[3 + i * 4] = proof.zmCqs[i].y_0;
            zmY[4 + i * 4] = proof.zmCqs[i].y_1;
        }

        Fr zmy = FrLib.fromBytes32(keccak256(abi.encodePacked(zmY)));
        logFr("zmy", zmy);
        return zmy;
    }

    function generateZMXZChallenges(Fr previousChallenge, HonkTypes.Proof memory proof) internal view returns (Fr, Fr) {
        uint256[4 + 1] memory buf;
        buf[0] = Fr.unwrap(previousChallenge);

        buf[1] = proof.zmCq.x_0;
        buf[2] = proof.zmCq.x_1;
        buf[3] = proof.zmCq.y_0;
        buf[4] = proof.zmCq.y_1;

        Fr zmX = FrLib.fromBytes32(keccak256(abi.encodePacked(buf)));
        logFr("zmX", zmX);
        Fr zmZ = FrLib.fromBytes32(keccak256(abi.encodePacked(zmX)));
        logFr("zmZ", zmZ);
        return (zmX, zmZ);
    }

    // We add an offset to the public inputs, this adds the values of our public inputs
    // to the copy constraints

    // TODO: mod p all the arithmetic here
    function computePublicInputDelta(
        bytes32[] memory publicInputs,
        Fr beta,
        Fr gamma,
        // TODO: check how to deal with this Domain size and offset are somewhat new
        uint256 domainSize,
        uint256 offset
    ) internal view returns (Fr) {
        logUint("domainSize", domainSize)        ;
        logUint("offset", offset)        ;

        logFr("beta", beta)        ;
        logFr("gamma", gamma)        ;

        Fr numerator = Fr.wrap(1);
        Fr denominator = Fr.wrap(1);

        // TODO(md): could we create a custom field type that maps, and has the + operator mapped to it???
        Fr numeratorAcc = gamma + (beta* FrLib.from(domainSize + offset));
        Fr denominatorAcc = gamma - (beta * FrLib.from(offset + 1));

        {
            for (uint256 i = 0; i < publicInputs.length; i++) {
            // TODO(md): remove casts when back to uint256 public inputs

                // TODO: assuming that public inputs are already mod P here: DOUBLE CHECK
                // TODO: make sure this check has already been performed
                numerator = numerator * (numeratorAcc + Fr.wrap(uint256(publicInputs[i])));
                denominator = denominator * (denominatorAcc + Fr.wrap(uint256(publicInputs[i])));

                numeratorAcc = numeratorAcc + beta;
                denominatorAcc = denominatorAcc - beta;
            }
        }

        logFr("numerator: ", numerator);
        logFr("denominator: ", denominator);

        // Fr delta = numerator / denominator; // TOOO: batch invert later?
        return FrLib.div(numerator, denominator);
    }

    // Incorportate the original plookup construction into honk
    function computeLookupGrandProductDelta(
        Fr beta,
        Fr gamma,
        // Again double check - i think it comes from the proving key
        uint256 domainSize
    ) internal view returns (Fr) {
        Fr gammaByOnePlusBeta = gamma * (beta + Fr.wrap(1));
        // TODO: dont like using ^ for exponent - might just make a function
        return gammaByOnePlusBeta ^ Fr.wrap(domainSize);
    }

    // TODO: check this is 0
    uint256 constant ROUND_TARGET = 0;

    function verifySumcheck(HonkTypes.Proof memory proof, TranscriptParameters memory tp) internal view returns (bool){
        bool verified = false;

        // TODO: This multivariate challenge is used in the final round
        Fr[LOG_N] memory multivariateChallenge;

        Fr roundTarget;
        Fr powPartialEvaluation = Fr.wrap(1);

        // We perform sumcheck reductions over log n rounds ( the multivariate degree )
        for (uint256 round; round < LOG_N; ++round) {
            // TODO: these must be mod p ????
            Fr[BATCHED_RELATION_PARTIAL_LENGTH] memory roundUnivariate = proof.sumcheckUnivariates[round];
            bool valid = checkSum(roundUnivariate, roundTarget);

            Fr roundChallenge = tp.sumCheckUChallenges[round];
            multivariateChallenge[round] = roundChallenge;

            // Update the round target for the next rounf
            roundTarget = computeNextTargetSum(roundUnivariate, roundChallenge);
            powPartialEvaluation = partiallyEvaluatePOW(tp, powPartialEvaluation, roundChallenge, round);
        }

        // Last round 

        accumulateRelationEvaluations(proof, tp, powPartialEvaluation);

        


        
        return verified;
    }

    // TODO: i assume that the round univarate will be a sliding window, so i will need to be included in here
    function checkSum(Fr[BATCHED_RELATION_PARTIAL_LENGTH] memory roundUnivariate, Fr roundTarget) internal view returns (bool) {
        Fr totalSum = roundUnivariate[0] + roundUnivariate[1];
        return totalSum != roundTarget;
    }


    // TODO: inject into the keys PRECOMPUTED FOR THIS CIRCUIT SIZE - should be inline compiled
    Fr[BATCHED_RELATION_PARTIAL_LENGTH] BARYCENTRIC_LAGRANGE_DENOMINATORS = [
        Fr.wrap(0x00000000000000000000000000000000000000000000000000000000000002d0),
        Fr.wrap(0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593efffff89),
        Fr.wrap(0x0000000000000000000000000000000000000000000000000000000000000030),
        Fr.wrap(0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593efffffdd),
        Fr.wrap(0x0000000000000000000000000000000000000000000000000000000000000030),
        Fr.wrap(0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593efffff89),
        Fr.wrap(0x00000000000000000000000000000000000000000000000000000000000002d0)
    ];

    Fr[BATCHED_RELATION_PARTIAL_LENGTH] BARYCENTRIC_DOMAIN = [
        Fr.wrap(0x00),
        Fr.wrap(0x01),
        Fr.wrap(0x02),
        Fr.wrap(0x03),
        Fr.wrap(0x04),
        Fr.wrap(0x05),
        Fr.wrap(0x06)
    ];

    // Return the new target sum for the next sumcheck round
    function computeNextTargetSum(Fr[BATCHED_RELATION_PARTIAL_LENGTH] memory roundUnivariates, Fr roundChallenge) internal view returns (Fr) {

        // To compute the next target sum, we evaluate the given univariate at a point u (challenge).

        // TODO: we want to model this using the same array for each iteration to not use up too much space
        // Performing Barycentric evaluations
        // Compute B(x)
        Fr numeratorValue = Fr.wrap(1);        
        // TODO: this will move with domain start and domain end, which i take as fixed for now
        for (uint256 i; i < BATCHED_RELATION_PARTIAL_LENGTH; ++i) {
            numeratorValue = numeratorValue * (roundChallenge - Fr.wrap(i));
        }

        // Numerator is correct
        logFr("numerator value 1", numeratorValue);

        // Calculate domain size N of inverses -- TODO: montgomery's trick
        Fr[BATCHED_RELATION_PARTIAL_LENGTH] memory denominatorInverses;
        for (uint256 i; i < BATCHED_RELATION_PARTIAL_LENGTH; ++i) {
            Fr inv = BARYCENTRIC_LAGRANGE_DENOMINATORS[i];
            inv = inv * (roundChallenge - BARYCENTRIC_DOMAIN[i]);
            inv = FrLib.invert(inv);
            denominatorInverses[i] = inv;
            logFr("domain inverse", i, inv);
        }

        Fr result;
        for (uint256 i; i < BATCHED_RELATION_PARTIAL_LENGTH; ++i) {
            Fr term = roundUnivariates[i];
            term = term * denominatorInverses[i]; // TODO ADJUST VS DOMAIN
            result = result + term;
        }
        // Scale the sum by the value of B(x) 
        result = result * numeratorValue;
        
        logFr("next target sum", result);
        return result;
    }

    function partiallyEvaluatePOW(TranscriptParameters memory tp, Fr currentEvaluation, Fr roundChallenge, uint256 round) internal view returns (Fr) {
        // Univariate evaluation of the monomial ((1-X_l) + X_l.B_l) at the challenge point X_l=u_l

        //                                                                                  TODO: subtraction wont wrap?
        Fr univariateEval = Fr.wrap(1) + (roundChallenge * (tp.gateChallenges[round] - Fr.wrap(1)));
        currentEvaluation = currentEvaluation * univariateEval;

        return currentEvaluation;
    }

    // Calculate the contributions of each relation to the expected value of the full honk relation
    // 
    // For each relation, we use the purported values ( the ones provided by the prover ) of the multivariates to
    // calculate a contribution to the purported value of the full Honk relation. 
    // These are stored in the evaluations part of the proof object.
    // We add these together, with the appropiate scaling factor ( the alphas calculated in challenges )
    // This value is checked against the final value of the target total sum - et voila!
    function accumulateRelationEvaluations(HonkTypes.Proof memory proof, TranscriptParameters memory tp, Fr powPartialEval) internal view returns (Fr) {
        // Fr[LOG_N] memory powUnivariate = tp.gateChallenges;
        Fr[NUMBER_OF_ENTITIES] memory purportedEvaluations = proof.sumcheckEvaluations;

        // NOTE: relation parameters will just be tp
        // In here we will check each relation manually

        // Maybe we can lay this out with a file for each relation group?
        // Order of realtions matters here

        // TODO: will need to check shifts?
        Fr[NUMBER_OF_SUBRELATIONS] memory evaluations;

        accumulateArithmeticRelation(purportedEvaluations, evaluations, powPartialEval);
        accumulatePermutationRelation(purportedEvaluations, tp, evaluations, powPartialEval);
        accumulateLookupRelation(purportedEvaluations, tp, evaluations, powPartialEval);
        accumulateGenPermRelation(purportedEvaluations, evaluations, powPartialEval);
        accumulateEllipticRelation(purportedEvaluations, evaluations, powPartialEval);


    }

    // Relations can go in their own files and be nice and readable
    function accumulateArithmeticRelation(Fr[NUMBER_OF_ENTITIES] memory p, Fr[NUMBER_OF_SUBRELATIONS] memory evals, Fr powPartialEval) internal view returns (Fr[2] memory){
        // sadly using memory loading to work around stack too deep

        // Relation 0
        // WIRES
        
        Fr q_arith = p[uint(WIRE.Q_ARITH)];
        {
            Fr neg_half = Fr.wrap(0) - (FrLib.invert(Fr.wrap(2)));

            Fr accum = (q_arith - Fr.wrap(3)) * (p[uint(WIRE.Q_M)] * p[uint(WIRE.W_R)] * p[uint(WIRE.W_L)]) * neg_half;
            accum = accum + (p[uint(WIRE.Q_L)] * p[uint(WIRE.W_L)]) + (p[uint(WIRE.Q_R)] * p[uint(WIRE.W_R)]) + (p[uint(WIRE.Q_O)] * p[uint(WIRE.W_O)]) + (p[uint(WIRE.Q_4)] * p[uint(WIRE.W_4)]) + p[uint(WIRE.Q_C)];
            accum = accum + (q_arith - Fr.wrap(1)) * p[uint(WIRE.W_4_SHIFT)];
            accum = accum * q_arith;
            accum = accum * powPartialEval;
            evals[0] = accum;
            logFr("aritmetic relation 0: ", accum);
        }

        // TODO: return into the evals object

        // Relation 1
        {

            Fr accum = p[uint(WIRE.W_L)] + p[uint(WIRE.W_4)] - p[uint(WIRE.W_L_SHIFT)] + p[uint(WIRE.Q_M)];
            accum = accum * (q_arith - Fr.wrap(2));
            accum = accum * (q_arith - Fr.wrap(1));
            accum = accum * q_arith;
            accum = accum * powPartialEval;
            logFr("aritmetic relation 1: ", accum);
            evals[1] = accum;
        }
        // TODO: return into the evals object
    }

    function accumulatePermutationRelation(Fr[NUMBER_OF_ENTITIES] memory p, TranscriptParameters memory tp, Fr[NUMBER_OF_SUBRELATIONS] memory evals, Fr powPartialEval) internal view {
        Fr grand_product_numerator;
        Fr grand_product_denominator;

        {
            Fr num = p[uint(WIRE.W_L)] + p[uint(WIRE.ID_1)] * tp.beta + tp.gamma;
            num = num * (p[uint(WIRE.W_R)] + p[uint(WIRE.ID_2)] * tp.beta + tp.gamma);
            num = num * (p[uint(WIRE.W_O)] + p[uint(WIRE.ID_3)] * tp.beta + tp.gamma);
            num = num * (p[uint(WIRE.W_4)] + p[uint(WIRE.ID_4)] * tp.beta + tp.gamma);

            grand_product_numerator = num;
            logFr("numerator", grand_product_numerator);
        }
        {
            Fr den = p[uint(WIRE.W_L)] + p[uint(WIRE.SIGMA_1)] * tp.beta + tp.gamma;
            den  = den * (p[uint(WIRE.W_R)] + p[uint(WIRE.SIGMA_2)] * tp.beta + tp.gamma);
            den  = den * (p[uint(WIRE.W_O)] + p[uint(WIRE.SIGMA_3)] * tp.beta + tp.gamma);
            den  = den * (p[uint(WIRE.W_4)] + p[uint(WIRE.SIGMA_4)] * tp.beta + tp.gamma);

            grand_product_denominator = den;
            logFr("denominator", grand_product_denominator);
        }

        // Contribution 2
        {
            Fr acc = (p[uint(WIRE.Z_PERM)] + p[uint(WIRE.LAGRANGE_FIRST)]) * grand_product_numerator; 

            acc = acc - ((p[uint(WIRE.Z_PERM_SHIFT)] + (p[uint(WIRE.LAGRANGE_LAST)] * tp.publicInputsDelta)) *  grand_product_denominator);
            acc = acc * powPartialEval;
            evals[2] = acc;
            logFr("perm rel 0: ", acc);
        }

        // Contribution 3
        {
            Fr acc = (p[uint(WIRE.LAGRANGE_LAST)] * p[uint(WIRE.Z_PERM_SHIFT)]) * powPartialEval;
            evals[3] = acc;
            logFr("perm rel 1: ", acc);
        }
    }


    struct LookupParams {
        Fr eta_sqr;
        Fr eta_cube;
        Fr one_plus_beta;
        Fr gamma_by_one_plus_beta;

        Fr wire_accum;
        Fr table_accum;
        Fr table_accum_shift;
    }

    function accumulateLookupRelation(Fr[NUMBER_OF_ENTITIES] memory p, TranscriptParameters memory tp, Fr[NUMBER_OF_SUBRELATIONS] memory evals, Fr powPartialEval) internal view {
        Fr grand_product_numerator;
        Fr grand_product_denominator;

        LookupParams memory lp;
        {
            lp.eta_sqr = tp.eta * tp.eta;
            lp.eta_cube = lp.eta_sqr * tp.eta;
            lp.one_plus_beta = tp.beta + Fr.wrap(1);
            lp.gamma_by_one_plus_beta = tp.gamma * lp.one_plus_beta;
        }

        {
            {
                // (p[uint(WIRE.W_L)] + q_2*p[uint(WIRE.W_1_SHIFT)]) + η(p[uint(WIRE.W_R)] + q_m*p[uint(WIRE.W_2_SHIFT)]) + η²(p[uint(WIRE.W_O)] + q_c*p[uint(WIRE.W_3_SHIFT)]) + η³q_index.
                // deg 2 or 4
                Fr wire_accum = (p[uint(WIRE.W_L)] + p[uint(WIRE.Q_R)] * p[uint(WIRE.W_L_SHIFT)]);
                wire_accum = wire_accum + (p[uint(WIRE.W_R)] + p[uint(WIRE.Q_M)] * p[uint(WIRE.W_R_SHIFT)]) * tp.eta;
                wire_accum = wire_accum +
                          (p[uint(WIRE.W_O)] + p[uint(WIRE.Q_C)] * p[uint(WIRE.W_O_SHIFT)]) * lp.eta_sqr;
                wire_accum = wire_accum + p[uint(WIRE.Q_O)] * lp.eta_cube;
                lp.wire_accum = wire_accum;
            }

            // t_1 + ηt_2 + η²t_3 + η³t_4
            // deg 1 or 4
            {
                Fr table_accum = p[uint(WIRE.TABLE_1)] + p[uint(WIRE.TABLE_2)] * tp.eta;
                table_accum = table_accum + p[uint(WIRE.TABLE_3)] * lp.eta_sqr;
                table_accum = table_accum + p[uint(WIRE.TABLE_4)] * lp.eta_cube;
                logFr("table_accum", table_accum);

                lp.table_accum = table_accum;
            }

            // t_1_shift + ηt_2_shift + η²t_3_shift + η³t_4_shift
            // deg 4
            {
                lp.table_accum_shift =
                    p[uint(WIRE.TABLE_1_SHIFT)] + p[uint(WIRE.TABLE_2_SHIFT)] * tp.eta + p[uint(WIRE.TABLE_3_SHIFT)] * lp.eta_sqr + p[uint(WIRE.TABLE_4_SHIFT)] * lp.eta_cube;
                
         }

            {
                Fr acc = (p[uint(WIRE.Q_LOOKUP)] * lp.wire_accum + tp.gamma);                          // deg 2 or 4
                acc = acc * (lp.table_accum + lp.table_accum_shift * tp.beta + lp.gamma_by_one_plus_beta);  // 1 or 5
                acc = acc * lp.one_plus_beta;                                                             // deg 1
                grand_product_numerator = acc;                                            // deg 4 or 10
                logFr("grand product numerator", grand_product_numerator);
            }
        }
        {
            Fr acc = (p[uint(WIRE.SORTED_ACCUM)] + p[uint(WIRE.SORTED_ACCUM_SHIFT)] * tp.beta + lp.gamma_by_one_plus_beta);
            grand_product_denominator = acc;
            logFr("grand product denominator", grand_product_denominator);
        }

        // Contribution 3
        {
            logFr("l gpd:", tp.lookupGrandProductDelta);

            Fr acc = grand_product_numerator * (p[uint(WIRE.Z_LOOKUP)] + p[uint(WIRE.LAGRANGE_FIRST)]) - grand_product_denominator * (p[uint(WIRE.Z_LOOKUP_SHIFT)] + p[uint(WIRE.LAGRANGE_LAST)] * tp.lookupGrandProductDelta);
            acc = acc * powPartialEval;
            evals[3] = acc;
            logFr("lookup cont 0", acc);
        }

        // Contribution 4
        {
            Fr acc = p[uint(WIRE.LAGRANGE_LAST)] * p[uint(WIRE.Z_LOOKUP_SHIFT)] * powPartialEval;
            evals[4] = acc;
            logFr("lookup cont 1", acc);
        }
    }

    function accumulateGenPermRelation(Fr[NUMBER_OF_ENTITIES] memory p, Fr[NUMBER_OF_SUBRELATIONS] memory evals, Fr powPartialEval) internal view {
        Fr minus_one = Fr.wrap(0) - Fr.wrap(1);
        Fr minus_two = Fr.wrap(0) - Fr.wrap(2);
        Fr minus_three = Fr.wrap(0) - Fr.wrap(3);

        // Compute wire differences
        Fr delta_1 = p[uint(WIRE.W_R)] - p[uint(WIRE.W_L)];
        Fr delta_2 = p[uint(WIRE.W_O)] - p[uint(WIRE.W_R)];
        Fr delta_3 = p[uint(WIRE.W_4)] - p[uint(WIRE.W_O)];
        Fr delta_4 = p[uint(WIRE.W_L_SHIFT)] - p[uint(WIRE.W_4)];

        // Contribution 5
        {
        Fr acc = delta_1;
        acc = acc * (delta_1 + minus_one);
        acc = acc * (delta_1 + minus_two);
        acc = acc * (delta_1 + minus_three);
        acc = acc * p[uint(WIRE.Q_SORT)];
        acc = acc * powPartialEval;
        evals[5] = acc;
        logFr("gen perm 1: ", acc);

        }

        // Contribution 6
        {
        Fr acc = delta_2;
        acc = acc * (delta_2 + minus_one);
        acc = acc * (delta_2 + minus_two);
        acc = acc * (delta_2 + minus_three);
        acc = acc * p[uint(WIRE.Q_SORT)];
        acc = acc * powPartialEval;
        evals[6] = acc;
        logFr("gen perm 2: ", acc);
        }

        // Contribution 7
        {
        Fr acc = delta_3;
        acc = acc * (delta_3 + minus_one);
        acc = acc * (delta_3 + minus_two);
        acc = acc * (delta_3 + minus_three);
        acc = acc * p[uint(WIRE.Q_SORT)];
        acc = acc * powPartialEval;
        evals[7] = acc;
        logFr("gen perm 3: ", acc);
        }

        // Contribution 8
        {
        Fr acc = delta_4;
        acc = acc * (delta_4 + minus_one);
        acc = acc * (delta_4 + minus_two);
        acc = acc * (delta_4 + minus_three);
        acc = acc * p[uint(WIRE.Q_SORT)];
        acc = acc * powPartialEval;
        evals[8] = acc;
        logFr("gen perm 4: ", acc);
        }

    }

    struct EllipticParams {
        Fr x_1;
        Fr y_1;
        Fr x_2;
        Fr y_2;
        Fr y_3;
        Fr x_3;

    }

    function accumulateEllipticRelation(Fr[NUMBER_OF_ENTITIES] memory p, Fr[NUMBER_OF_SUBRELATIONS] memory evals, Fr powPartialEval) internal view {
        EllipticParams memory ep;
        ep.x_1 = p[uint(WIRE.W_R)];
        ep.y_1 = p[uint(WIRE.W_O)];
        
        ep.x_2 = p[uint(WIRE.W_L_SHIFT)];
        ep.y_2 = p[uint(WIRE.W_4_SHIFT)];
        ep.y_3 = p[uint(WIRE.W_O_SHIFT)];
        ep.x_3 = p[uint(WIRE.W_R_SHIFT)];

        Fr q_sign = p[uint(WIRE.Q_L)];
        Fr q_is_double = p[uint(WIRE.Q_M)];

        // Contribution 9 point addition, x-coordinate check
        // q_elliptic * (x3 + x2 + x1)(x2 - x1)(x2 - x1) - y2^2 - y1^2 + 2(y2y1)*q_sign = 0
        Fr x_diff = (ep.x_2 - ep.x_1);
        Fr y1_sqr = (ep.y_1 * ep.y_1);
        {
            // Move to top
            Fr partialEval = powPartialEval;

            Fr y2_sqr = (ep.y_2 * ep.y_2);
            Fr y1y2 = ep.y_1 * ep.y_2 * q_sign;
            Fr x_add_identity = (ep.x_3 + ep.x_2 + ep.x_1);
            x_add_identity = x_add_identity * x_diff * x_diff;
            x_add_identity = x_add_identity - y2_sqr - y1_sqr + y1y2 + y1y2;

            evals[9] = x_add_identity * partialEval * p[uint(WIRE.Q_ELLIPTIC)] * (Fr.wrap(1) - q_is_double);
        }

        // Contribution 10 point addition, x-coordinate check
        // q_elliptic * (q_sign * y1 + y3)(x2 - x1) + (x3 - x1)(y2 - q_sign * y1) = 0
        {
            Fr y1_plus_y3 = ep.y_1 + ep.y_3;
            Fr y_diff = ep.y_2 * q_sign - ep.y_1;
            Fr y_add_identity = y1_plus_y3 * x_diff + (ep.x_3 - ep.x_1) * y_diff;
            evals[10] = y_add_identity * powPartialEval * p[uint(WIRE.Q_ELLIPTIC)] * (Fr.wrap(1) - q_is_double);
        }

        // Contribution 11 point doubling, x-coordinate check
        // (x3 + x1 + x1) (4y1*y1) - 9 * x1 * x1 * x1 * x1 = 0
        // N.B. we're using the equivalence x1*x1*x1 === y1*y1 - curve_b to reduce degree by 1
        {
            Fr x_pow_4 = (y1_sqr + GRUMPKIN_CURVE_B_PARAMETER_NEGATED) * ep.x_1;
            Fr y1_sqr_mul_4 = y1_sqr + y1_sqr;
            y1_sqr_mul_4 = y1_sqr_mul_4 + y1_sqr_mul_4;
            Fr x1_pow_4_mul_9 = x_pow_4 * Fr.wrap(9);
            Fr x_double_identity = (ep.x_3 + ep.x_1 + ep.x_1) * y1_sqr_mul_4 - x1_pow_4_mul_9;
            
            Fr acc = x_double_identity * powPartialEval * p[uint(WIRE.Q_ELLIPTIC)] * q_is_double;
            evals[9] = evals[9] + acc;
            logFr("middle 0", evals[9]);
        }

        // Contribution 12 point doubling, y-coordinate check
        // (y1 + y1) (2y1) - (3 * x1 * x1)(x1 - x3) = 0
        {
            Fr x1_sqr_mul_3 = (ep.x_1 + ep.x_1 + ep.x_1) * ep.x_1;
            Fr y_double_identity = x1_sqr_mul_3 * (ep.x_1 - ep.x_3) - (ep.y_1 + ep.y_1) * (ep.y_1 + ep.y_3);
            evals[10] = evals[10] + y_double_identity * powPartialEval * p[uint(WIRE.Q_ELLIPTIC)] * q_is_double;
            logFr("middle 1", evals[10]);
        }
    }


    // TODO: convert each of the 4 limb commitments into single limb for accumulation



    // function verifyZeroMorph() {}
}
