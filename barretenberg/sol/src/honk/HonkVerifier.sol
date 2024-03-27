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
    uint256 internal constant NUMBER_OF_SUBRELATIONS = 18;
    uint256 internal constant NUMBER_OF_ALPHAS = 17;
    uint256 internal constant BATCHED_RELATION_PARTIAL_LENGTH = 7;
    uint256 internal constant NUMBER_OF_ENTITIES = 43;
    Fr internal constant GRUMPKIN_CURVE_B_PARAMETER_NEGATED = Fr.wrap(17); // -(-17) 

    uint256 constant Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583; // EC group order
    uint256 constant P = 21888242871839275222246405745257275088548364400416034343698204186575808495617; // Prime field order

    // Circuit size
    uint256 constant N = 32;
    /// Log of the circuit size - precomputed
    uint256 constant LOG_N = 5;

    struct ProofParameters {
        uint256 logCircuitSize;
    }

    struct TranscriptParameters {
        // Relation Challenges
        Fr[NUMBER_OF_ALPHAS] alphas;
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

    function logG(string memory name, HonkTypes.G1Point memory point) internal pure {
        // TODO: convert both to hex before printing to line up with cpp
        string memory x = bytes32ToString(bytes32(point.x));
        string memory y = bytes32ToString(bytes32(point.y));

        string memory message = string(abi.encodePacked(name, " x: ", x, " y: ",  y));
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
        p.publicInputsSize = uint256(bytes32(proof[0x20:0x40]));
        p.publicInputsOffset = uint256(bytes32(proof[0x40:0x60]));

        // TODO: Assset sizes are the same as vk - maybe not required actually

        // Commitments
        p.w1 = HonkTypes.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x60:0x80])), x_1: uint256(bytes32(proof[0x80:0xa0])),
            y_0: uint256(bytes32(proof[0xa0:0xc0])), y_1: uint256(bytes32(proof[0xc0:0xe0]))});

        p.w2 = HonkTypes.G1ProofPoint({
            x_0: uint256(bytes32(proof[0xe0:0x100])), x_1: uint256(bytes32(proof[0x100:0x120])), 
            y_0: uint256(bytes32(proof[0x120:0x140])), y_1: uint256(bytes32(proof[0x140:0x160]))});
        p.w3 = HonkTypes.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x160:0x180])), x_1: uint256(bytes32(proof[0x180:0x1a0])),
            y_0: uint256(bytes32(proof[0x1a0:0x1c0])), y_1: uint256(bytes32(proof[0x1c0:0x1e0]))});

        // Lookup / Permutation Helper Commitments
        p.sortedAccum =
            HonkTypes.G1ProofPoint({
                x_0: uint256(bytes32(proof[0x1e0:0x200])), x_1: uint256(bytes32(proof[0x200:0x220])),
                y_0: uint256(bytes32(proof[0x220:0x240])), y_1: uint256(bytes32(proof[0x240:0x260]))
            });
        p.w4 = HonkTypes.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x260:0x280])), x_1: uint256(bytes32(proof[0x280:0x2a0])),
            y_0: uint256(bytes32(proof[0x2a0:0x2c0])), y_1: uint256(bytes32(proof[0x2c0:0x2e0]))
        });

        p.zPerm = HonkTypes.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x2e0:0x300])), x_1: uint256(bytes32(proof[0x300:0x320])),
            y_0: uint256(bytes32(proof[0x320:0x340])), y_1: uint256(bytes32(proof[0x340:0x360]))
        });

        p.zLookup =
            HonkTypes.G1ProofPoint({
                x_0: uint256(bytes32(proof[0x360:0x380])), x_1: uint256(bytes32(proof[0x380:0x3a0])),
                y_0: uint256(bytes32(proof[0x3a0:0x3c0])), y_1: uint256(bytes32(proof[0x3c0:0x3e0]))
            });

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

        // Zeromorph
        bool verified = verifyZeroMorph(p, vk, tp);

        return (success && verified);
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

        tp.gateChallenges = generateGateChallenges(tp.alphas[NUMBER_OF_ALPHAS - 1]);

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
        Fr gamma = FrLib.fromBytes32(keccak256(abi.encodePacked(beta)));
        return (beta, gamma);
    }


    // Alpha challenges non-linearise the gate contributions
    function generateAlphaChallenges(Fr previousChallenge, HonkTypes.Proof memory proof) 
        internal view
        returns (Fr[NUMBER_OF_ALPHAS] memory)
    {
        Fr[NUMBER_OF_ALPHAS] memory alphas;

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

        Fr prevChallenge = alphas[0];
        for (uint256 i = 1; i < NUMBER_OF_ALPHAS; i++) {
            prevChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(Fr.unwrap(prevChallenge))));
            alphas[i] = prevChallenge;
        }
        return alphas;
    }

    function generateGateChallenges(Fr previousChallenge) internal view returns (Fr[LOG_N] memory) {
        Fr[LOG_N] memory gateChallanges;
        for (uint256 i = 0; i < LOG_N; i++) {
            previousChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(Fr.unwrap(previousChallenge))));
            gateChallanges[i] = previousChallenge;
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
        Fr zmZ = FrLib.fromBytes32(keccak256(abi.encodePacked(zmX)));
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

    function verifySumcheck(HonkTypes.Proof memory proof, TranscriptParameters memory tp) internal view returns (bool verified){
        Fr roundTarget;
        Fr powPartialEvaluation = Fr.wrap(1);

        // We perform sumcheck reductions over log n rounds ( the multivariate degree )
        for (uint256 round; round < LOG_N; ++round) {
            // TODO: these must be mod p ????
            Fr[BATCHED_RELATION_PARTIAL_LENGTH] memory roundUnivariate = proof.sumcheckUnivariates[round];
            bool valid = checkSum(roundUnivariate, roundTarget);

            Fr roundChallenge = tp.sumCheckUChallenges[round];

            // Update the round target for the next rounf
            roundTarget = computeNextTargetSum(roundUnivariate, roundChallenge);
            powPartialEvaluation = partiallyEvaluatePOW(tp, powPartialEvaluation, roundChallenge, round);
        }

        // Last round 
        Fr grandHonkRelationSum = accumulateRelationEvaluations(proof, tp, powPartialEvaluation);

        // TODO: Impl comparison
        verified = (Fr.unwrap(grandHonkRelationSum) == Fr.unwrap(roundTarget));

        console.log("verified", verified);
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

        // Calculate domain size N of inverses -- TODO: montgomery's trick
        Fr[BATCHED_RELATION_PARTIAL_LENGTH] memory denominatorInverses;
        for (uint256 i; i < BATCHED_RELATION_PARTIAL_LENGTH; ++i) {
            Fr inv = BARYCENTRIC_LAGRANGE_DENOMINATORS[i];
            inv = inv * (roundChallenge - BARYCENTRIC_DOMAIN[i]);
            inv = FrLib.invert(inv);
            denominatorInverses[i] = inv;
        }

        Fr result;
        for (uint256 i; i < BATCHED_RELATION_PARTIAL_LENGTH; ++i) {
            Fr term = roundUnivariates[i];
            term = term * denominatorInverses[i]; // TODO ADJUST VS DOMAIN
            result = result + term;
        }
        // Scale the sum by the value of B(x) 
        result = result * numeratorValue;
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

        // Accumulate all 6 custom gates - each with varying number of subrelations 
        // TODO: annotate how many subrealtions each has
        accumulateArithmeticRelation(purportedEvaluations, evaluations, powPartialEval);
        accumulatePermutationRelation(purportedEvaluations, tp, evaluations, powPartialEval);
        accumulateLookupRelation(purportedEvaluations, tp, evaluations, powPartialEval);
        accumulateGenPermRelation(purportedEvaluations, evaluations, powPartialEval);
        accumulateEllipticRelation(purportedEvaluations, evaluations, powPartialEval);
        accumulateAuxillaryRelation(purportedEvaluations, tp, evaluations, powPartialEval);

        // Apply alpha challenges to challenge evaluations
        // Returns grand honk realtion evaluation
        return scaleAndBatchSubrelations(evaluations, tp.alphas);
}

    function wire(Fr[NUMBER_OF_ENTITIES] memory p, WIRE _wire) internal pure returns (Fr) {
        return p[uint256(_wire)];
    }

    // Relations can go in their own files and be nice and readable
    function accumulateArithmeticRelation(Fr[NUMBER_OF_ENTITIES] memory p, Fr[NUMBER_OF_SUBRELATIONS] memory evals, Fr powPartialEval) internal view returns (Fr[2] memory){
        // sadly using memory loading to work around stack too deep

        // Relation 0
        // WIRES
        
        Fr q_arith = wire(p,WIRE.Q_ARITH);
        {
            Fr neg_half = Fr.wrap(0) - (FrLib.invert(Fr.wrap(2)));

            Fr accum = (q_arith - Fr.wrap(3)) * (wire(p,WIRE.Q_M) * wire(p,WIRE.W_R) * wire(p,WIRE.W_L)) * neg_half;
            accum = accum + (wire(p,WIRE.Q_L) * wire(p,WIRE.W_L)) + (wire(p,WIRE.Q_R) * wire(p,WIRE.W_R)) + (wire(p,WIRE.Q_O) * wire(p,WIRE.W_O)) + (wire(p,WIRE.Q_4) * wire(p,WIRE.W_4)) + wire(p,WIRE.Q_C);
            accum = accum + (q_arith - Fr.wrap(1)) * wire(p,WIRE.W_4_SHIFT);
            accum = accum * q_arith;
            accum = accum * powPartialEval;
            evals[0] = accum;
        }

        // TODO: return into the evals object

        // Relation 1
        {

            Fr accum = wire(p,WIRE.W_L) + wire(p,WIRE.W_4) - wire(p,WIRE.W_L_SHIFT) + wire(p,WIRE.Q_M);
            accum = accum * (q_arith - Fr.wrap(2));
            accum = accum * (q_arith - Fr.wrap(1));
            accum = accum * q_arith;
            accum = accum * powPartialEval;
            evals[1] = accum;
        }
        // TODO: return into the evals object
    }

    function accumulatePermutationRelation(Fr[NUMBER_OF_ENTITIES] memory p, TranscriptParameters memory tp, Fr[NUMBER_OF_SUBRELATIONS] memory evals, Fr powPartialEval) internal view {
        Fr grand_product_numerator;
        Fr grand_product_denominator;

        {
            Fr num = wire(p,WIRE.W_L) + wire(p,WIRE.ID_1) * tp.beta + tp.gamma;
            num = num * (wire(p,WIRE.W_R) + wire(p,WIRE.ID_2) * tp.beta + tp.gamma);
            num = num * (wire(p,WIRE.W_O) + wire(p,WIRE.ID_3) * tp.beta + tp.gamma);
            num = num * (wire(p,WIRE.W_4) + wire(p,WIRE.ID_4) * tp.beta + tp.gamma);

            grand_product_numerator = num;
        }
        {
            Fr den = wire(p,WIRE.W_L) + wire(p,WIRE.SIGMA_1) * tp.beta + tp.gamma;
            den  = den * (wire(p,WIRE.W_R) + wire(p,WIRE.SIGMA_2) * tp.beta + tp.gamma);
            den  = den * (wire(p,WIRE.W_O) + wire(p,WIRE.SIGMA_3) * tp.beta + tp.gamma);
            den  = den * (wire(p,WIRE.W_4) + wire(p,WIRE.SIGMA_4) * tp.beta + tp.gamma);

            grand_product_denominator = den;
        }

        // Contribution 2
        {
            Fr acc = (wire(p,WIRE.Z_PERM) + wire(p,WIRE.LAGRANGE_FIRST)) * grand_product_numerator; 

            acc = acc - ((wire(p,WIRE.Z_PERM_SHIFT) + (wire(p,WIRE.LAGRANGE_LAST) * tp.publicInputsDelta)) *  grand_product_denominator);
            acc = acc * powPartialEval;
            evals[2] = acc;
        }

        // Contribution 3
        {
            Fr acc = (wire(p,WIRE.LAGRANGE_LAST) * wire(p,WIRE.Z_PERM_SHIFT)) * powPartialEval;
            evals[3] = acc;
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
                // (wire(p,WIRE.W_L)] + q_2*wire(p,WIRE.W_1_SHIFT)]) + η(wire(p,WIRE.W_R)] + q_m*wire(p,WIRE.W_2_SHIFT)]) + η²(wire(p,WIRE.W_O)] + q_c*wire(p,WIRE.W_3_SHIFT)]) + η³q_index.
                // deg 2 or 4
                Fr wire_accum = (wire(p,WIRE.W_L) + wire(p,WIRE.Q_R) * wire(p,WIRE.W_L_SHIFT));
                wire_accum = wire_accum + (wire(p,WIRE.W_R) + wire(p,WIRE.Q_M) * wire(p,WIRE.W_R_SHIFT)) * tp.eta;
                wire_accum = wire_accum +
                          (wire(p,WIRE.W_O) + wire(p,WIRE.Q_C) * wire(p,WIRE.W_O_SHIFT)) * lp.eta_sqr;
                wire_accum = wire_accum + wire(p,WIRE.Q_O) * lp.eta_cube;
                lp.wire_accum = wire_accum;
            }

            // t_1 + ηt_2 + η²t_3 + η³t_4
            // deg 1 or 4
            {
                Fr table_accum = wire(p,WIRE.TABLE_1) + wire(p,WIRE.TABLE_2) * tp.eta;
                table_accum = table_accum + wire(p,WIRE.TABLE_3) * lp.eta_sqr;
                table_accum = table_accum + wire(p,WIRE.TABLE_4) * lp.eta_cube;

                lp.table_accum = table_accum;
            }

            // t_1_shift + ηt_2_shift + η²t_3_shift + η³t_4_shift
            // deg 4
            {
                lp.table_accum_shift =
                    wire(p,WIRE.TABLE_1_SHIFT) + wire(p,WIRE.TABLE_2_SHIFT) * tp.eta + wire(p,WIRE.TABLE_3_SHIFT) * lp.eta_sqr + wire(p,WIRE.TABLE_4_SHIFT) * lp.eta_cube;
                
         }

            {
                Fr acc = (wire(p,WIRE.Q_LOOKUP) * lp.wire_accum + tp.gamma);                          // deg 2 or 4
                acc = acc * (lp.table_accum + lp.table_accum_shift * tp.beta + lp.gamma_by_one_plus_beta);  // 1 or 5
                acc = acc * lp.one_plus_beta;                                                             // deg 1
                grand_product_numerator = acc;                                            // deg 4 or 10
            }
        }
        {
            Fr acc = (wire(p,WIRE.SORTED_ACCUM) + wire(p,WIRE.SORTED_ACCUM_SHIFT) * tp.beta + lp.gamma_by_one_plus_beta);
            grand_product_denominator = acc;
        }

        // Contribution 4
        {
            Fr acc = grand_product_numerator * (wire(p,WIRE.Z_LOOKUP) + wire(p,WIRE.LAGRANGE_FIRST)) - grand_product_denominator * (wire(p,WIRE.Z_LOOKUP_SHIFT) + wire(p,WIRE.LAGRANGE_LAST) * tp.lookupGrandProductDelta);
            acc = acc * powPartialEval;
            evals[4] = acc;
        }

        // Contribution 5
        {
            Fr acc = wire(p,WIRE.LAGRANGE_LAST) * wire(p,WIRE.Z_LOOKUP_SHIFT) * powPartialEval;
            evals[5] = acc;
        }
    }

    function accumulateGenPermRelation(Fr[NUMBER_OF_ENTITIES] memory p, Fr[NUMBER_OF_SUBRELATIONS] memory evals, Fr powPartialEval) internal view {
        Fr minus_one = Fr.wrap(0) - Fr.wrap(1);
        Fr minus_two = Fr.wrap(0) - Fr.wrap(2);
        Fr minus_three = Fr.wrap(0) - Fr.wrap(3);

        // Compute wire differences
        Fr delta_1 = wire(p,WIRE.W_R) - wire(p,WIRE.W_L);
        Fr delta_2 = wire(p,WIRE.W_O) - wire(p,WIRE.W_R);
        Fr delta_3 = wire(p,WIRE.W_4) - wire(p,WIRE.W_O);
        Fr delta_4 = wire(p,WIRE.W_L_SHIFT) - wire(p,WIRE.W_4);

        // Contribution 6
        {
            Fr acc = delta_1;
            acc = acc * (delta_1 + minus_one);
            acc = acc * (delta_1 + minus_two);
            acc = acc * (delta_1 + minus_three);
            acc = acc * wire(p,WIRE.Q_SORT);
            acc = acc * powPartialEval;
            evals[6] = acc;
        }

        // Contribution 7
        {
            Fr acc = delta_2;
            acc = acc * (delta_2 + minus_one);
            acc = acc * (delta_2 + minus_two);
            acc = acc * (delta_2 + minus_three);
            acc = acc * wire(p,WIRE.Q_SORT);
            acc = acc * powPartialEval;
            evals[7] = acc;
        }

        // Contribution 8
        {
            Fr acc = delta_3;
            acc = acc * (delta_3 + minus_one);
            acc = acc * (delta_3 + minus_two);
            acc = acc * (delta_3 + minus_three);
            acc = acc * wire(p,WIRE.Q_SORT);
            acc = acc * powPartialEval;
            evals[8] = acc;
        }

        // Contribution 9
        {
        Fr acc = delta_4;
        acc = acc * (delta_4 + minus_one);
        acc = acc * (delta_4 + minus_two);
        acc = acc * (delta_4 + minus_three);
        acc = acc * wire(p,WIRE.Q_SORT);
        acc = acc * powPartialEval;
        evals[9] = acc;
        }

    }

    struct EllipticParams {
        // Points
        Fr x_1;
        Fr y_1;
        Fr x_2;
        Fr y_2;
        Fr y_3;
        Fr x_3;

        // push accumulators into memory
        Fr x_double_identity;
    }

    function accumulateEllipticRelation(Fr[NUMBER_OF_ENTITIES] memory p, Fr[NUMBER_OF_SUBRELATIONS] memory evals, Fr powPartialEval) internal view {
        EllipticParams memory ep;
        ep.x_1 = wire(p,WIRE.W_R);
        ep.y_1 = wire(p,WIRE.W_O);
        
        ep.x_2 = wire(p,WIRE.W_L_SHIFT);
        ep.y_2 = wire(p,WIRE.W_4_SHIFT);
        ep.y_3 = wire(p,WIRE.W_O_SHIFT);
        ep.x_3 = wire(p,WIRE.W_R_SHIFT);

        Fr q_sign = wire(p,WIRE.Q_L);
        Fr q_is_double = wire(p,WIRE.Q_M);

        // Contribution 10 point addition, x-coordinate check
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

            evals[10] = x_add_identity * partialEval * wire(p,WIRE.Q_ELLIPTIC) * (Fr.wrap(1) - q_is_double);
        }

        // Contribution 11 point addition, x-coordinate check
        // q_elliptic * (q_sign * y1 + y3)(x2 - x1) + (x3 - x1)(y2 - q_sign * y1) = 0
        {
            Fr y1_plus_y3 = ep.y_1 + ep.y_3;
            Fr y_diff = ep.y_2 * q_sign - ep.y_1;
            Fr y_add_identity = y1_plus_y3 * x_diff + (ep.x_3 - ep.x_1) * y_diff;
            evals[11] = y_add_identity * powPartialEval * wire(p,WIRE.Q_ELLIPTIC) * (Fr.wrap(1) - q_is_double);
        }

        // Contribution 10 point doubling, x-coordinate check
        // (x3 + x1 + x1) (4y1*y1) - 9 * x1 * x1 * x1 * x1 = 0
        // N.B. we're using the equivalence x1*x1*x1 === y1*y1 - curve_b to reduce degree by 1
        {
            Fr x_pow_4 = (y1_sqr + GRUMPKIN_CURVE_B_PARAMETER_NEGATED) * ep.x_1;
            Fr y1_sqr_mul_4 = y1_sqr + y1_sqr;
            y1_sqr_mul_4 = y1_sqr_mul_4 + y1_sqr_mul_4;
            Fr x1_pow_4_mul_9 = x_pow_4 * Fr.wrap(9);

            // NOTE: pushed into memory (stack >:'( )
            ep.x_double_identity = (ep.x_3 + ep.x_1 + ep.x_1) * y1_sqr_mul_4 - x1_pow_4_mul_9;
            
            Fr acc = ep.x_double_identity * powPartialEval * wire(p,WIRE.Q_ELLIPTIC) * q_is_double;
            evals[10] = evals[10] + acc;
        }

        // Contribution 11 point doubling, y-coordinate check
        // (y1 + y1) (2y1) - (3 * x1 * x1)(x1 - x3) = 0
        {
            Fr x1_sqr_mul_3 = (ep.x_1 + ep.x_1 + ep.x_1) * ep.x_1;
            Fr y_double_identity = x1_sqr_mul_3 * (ep.x_1 - ep.x_3) - (ep.y_1 + ep.y_1) * (ep.y_1 + ep.y_3);
            evals[11] = evals[11] + y_double_identity * powPartialEval * wire(p,WIRE.Q_ELLIPTIC) * q_is_double;
        }
    }

    // Constants for proving the auxiliary relation
    Fr constant LIMB_SIZE = Fr.wrap(uint256(1) << 68);
    Fr constant SUBLIMB_SHIFT = Fr.wrap(uint256(1) << 14);
    Fr constant MINUS_ONE = Fr.wrap(P - 1);

    struct AuxParams {
        // To get around stack
        Fr limb_subproduct;

        Fr non_native_field_gate_1;
        Fr non_native_field_gate_2;
        Fr non_native_field_gate_3;

        Fr limb_accumulator_1;
        Fr limb_accumulator_2;


        Fr memory_record_check;
        Fr partial_record_check;

        Fr next_gate_access_type;

        Fr record_delta;
        Fr index_delta;

        Fr adjacent_values_match_if_adjacent_indices_match;
        Fr adjacent_values_match_if_adjacent_indices_match_and_next_access_is_a_read_operation;

        Fr access_check;

        Fr next_gate_access_type_is_boolean;

        Fr ROM_consistency_check_identity;
        Fr RAM_consistency_check_identity;

        Fr timestamp_delta;
        Fr RAM_timestamp_check_identity;

        Fr memory_identity;

        Fr index_is_monotonically_increasing;

        Fr auxiliary_identity;

    }

    function accumulateAuxillaryRelation(Fr[NUMBER_OF_ENTITIES] memory p, TranscriptParameters memory tp, Fr[NUMBER_OF_SUBRELATIONS] memory evals, Fr powPartialEval) internal pure {
        
        AuxParams memory ap;

        /**
         * Contribution 12
         * Non native field arithmetic gate 2
         * deg 4
         *
         *             _                                                                               _
         *            /   _                   _                               _       14                \
         * q_2 . q_4 |   (w_1 . w_2) + (w_1 . w_2) + (w_1 . w_4 + w_2 . w_3 - w_3) . 2    - w_3 - w_4   |
         *            \_                                                                               _/
         *
         **/
        // TODO: make these less lined up
        ap.limb_subproduct = wire(p, WIRE.W_L) * wire(p, WIRE.W_R_SHIFT) + wire(p, WIRE.W_L_SHIFT) * wire(p, WIRE.W_R);
        ap.non_native_field_gate_2 = (wire(p, WIRE.W_L) * wire(p, WIRE.W_4) + wire(p, WIRE.W_R) * wire(p, WIRE.W_O) - wire(p, WIRE.W_O_SHIFT));
        ap.non_native_field_gate_2 = ap.non_native_field_gate_2 * LIMB_SIZE;
        ap.non_native_field_gate_2 = ap.non_native_field_gate_2 - wire(p, WIRE.W_4_SHIFT);
        ap.non_native_field_gate_2 = ap.non_native_field_gate_2 + ap.limb_subproduct;
        ap.non_native_field_gate_2 = ap.non_native_field_gate_2 * wire(p, WIRE.Q_4);

        ap.limb_subproduct = ap.limb_subproduct * LIMB_SIZE;
        ap.limb_subproduct = ap.limb_subproduct + (wire(p, WIRE.W_L_SHIFT) * wire(p, WIRE.W_R_SHIFT));
        ap.non_native_field_gate_1 = ap.limb_subproduct;
        ap.non_native_field_gate_1 = ap.non_native_field_gate_1 - (wire(p, WIRE.W_O) + wire(p, WIRE.W_4));
        ap.non_native_field_gate_1 = ap.non_native_field_gate_1 *  wire(p, WIRE.Q_O);

        ap.non_native_field_gate_3 = ap.limb_subproduct;
        ap.non_native_field_gate_3 = ap.non_native_field_gate_3 + wire(p, WIRE.W_4);
        ap.non_native_field_gate_3 = ap.non_native_field_gate_3 - (wire(p, WIRE.W_O_SHIFT) + wire(p, WIRE.W_4_SHIFT));
        ap.non_native_field_gate_3 = ap.non_native_field_gate_3 * wire(p, WIRE.Q_M);

        Fr non_native_field_identity = ap.non_native_field_gate_1 + ap.non_native_field_gate_2 + ap.non_native_field_gate_3;
        non_native_field_identity = non_native_field_identity * wire(p, WIRE.Q_R);

        // ((((w2' * 2^14 + w1') * 2^14 + w3) * 2^14 + w2) * 2^14 + w1 - w4) * qm
        // deg 2
        ap.limb_accumulator_1 = wire(p, WIRE.W_R_SHIFT) * SUBLIMB_SHIFT;
        ap.limb_accumulator_1 = ap.limb_accumulator_1 + wire(p, WIRE.W_L_SHIFT);
        ap.limb_accumulator_1 = ap.limb_accumulator_1 * SUBLIMB_SHIFT;
        ap.limb_accumulator_1 = ap.limb_accumulator_1 + wire(p, WIRE.W_O);
        ap.limb_accumulator_1 = ap.limb_accumulator_1 * SUBLIMB_SHIFT;
        ap.limb_accumulator_1 = ap.limb_accumulator_1 + wire(p, WIRE.W_R);
        ap.limb_accumulator_1 = ap.limb_accumulator_1 * SUBLIMB_SHIFT;
        ap.limb_accumulator_1 =  ap.limb_accumulator_1 + wire(p, WIRE.W_L);
        ap.limb_accumulator_1 = ap.limb_accumulator_1 - wire(p, WIRE.W_4);
        ap.limb_accumulator_1 = ap.limb_accumulator_1 * wire(p, WIRE.Q_4);

        // ((((w3' * 2^14 + w2') * 2^14 + w1') * 2^14 + w4) * 2^14 + w3 - w4') * qm
        // deg 2
        ap.limb_accumulator_2 = wire(p, WIRE.W_O_SHIFT) * SUBLIMB_SHIFT;
        ap.limb_accumulator_2 = ap.limb_accumulator_2 + wire(p, WIRE.W_R_SHIFT);
        ap.limb_accumulator_2 = ap.limb_accumulator_2 * SUBLIMB_SHIFT;
        ap.limb_accumulator_2 = ap.limb_accumulator_2 + wire(p, WIRE.W_L_SHIFT);
        ap.limb_accumulator_2 = ap.limb_accumulator_2 * SUBLIMB_SHIFT;
        ap.limb_accumulator_2 = ap.limb_accumulator_2 + wire(p, WIRE.W_4);
        ap.limb_accumulator_2 = ap.limb_accumulator_2 * SUBLIMB_SHIFT;
        ap.limb_accumulator_2 = ap.limb_accumulator_2 + wire(p, WIRE.W_O);
        ap.limb_accumulator_2 = ap.limb_accumulator_2 - wire(p, WIRE.W_4_SHIFT);
        ap.limb_accumulator_2 = ap.limb_accumulator_2 * wire(p, WIRE.Q_M);

        Fr limb_accumulator_identity = ap.limb_accumulator_1 + ap.limb_accumulator_2;
        limb_accumulator_identity = limb_accumulator_identity * wire(p, WIRE.Q_O); //  deg 3

        /**
         * MEMORY
         *
         * A RAM memory record contains a tuple of the following fields:
         *  * i: `index` of memory cell being accessed
         *  * t: `timestamp` of memory cell being accessed (used for RAM, set to 0 for ROM)
         *  * v: `value` of memory cell being accessed
         *  * a: `access` type of record. read: 0 = read, 1 = write
         *  * r: `record` of memory cell. record = access + index * eta + timestamp * eta^2 + value * eta^3
         *
         * A ROM memory record contains a tuple of the following fields:
         *  * i: `index` of memory cell being accessed
         *  * v: `value1` of memory cell being accessed (ROM tables can store up to 2 values per index)
         *  * v2:`value2` of memory cell being accessed (ROM tables can store up to 2 values per index)
         *  * r: `record` of memory cell. record = index * eta + value2 * eta^2 + value1 * eta^3
         *
         *  When performing a read/write access, the values of i, t, v, v2, a, r are stored in the following wires +
         * selectors, depending on whether the gate is a RAM read/write or a ROM read
         *
         *  | gate type | i  | v2/t  |  v | a  | r  |
         *  | --------- | -- | ----- | -- | -- | -- |
         *  | ROM       | w1 | w2    | w3 | -- | w4 |
         *  | RAM       | w1 | w2    | w3 | qc | w4 |
         *
         * (for accesses where `index` is a circuit constant, it is assumed the circuit will apply a copy constraint on
         * `w2` to fix its value)
         *
         **/

        /**
         * Memory Record Check
         * Partial degree: 1
         * Total degree: 4
         *
         * A ROM/ROM access gate can be evaluated with the identity:
         *
         * qc + w1 \eta + w2 \eta^2 + w3 \eta^3 - w4 = 0
         *
         * For ROM gates, qc = 0
         */
        ap.memory_record_check = wire(p, WIRE.W_O) * tp.eta;
        ap.memory_record_check = ap.memory_record_check + wire(p, WIRE.W_R);
        ap.memory_record_check = ap.memory_record_check * tp.eta;
        ap.memory_record_check = ap.memory_record_check + wire(p, WIRE.W_L);
        ap.memory_record_check = ap.memory_record_check * tp.eta;
        ap.memory_record_check = ap.memory_record_check + wire(p, WIRE.Q_C);
        ap.partial_record_check = ap.memory_record_check; // used in RAM consistency check; deg 1 or 4
        ap.memory_record_check = ap.memory_record_check - wire(p, WIRE.W_4);

        /**
         * Contribution 13 & 14
         * ROM Consistency Check
         * Partial degree: 1
         * Total degree: 4
         *
         * For every ROM read, a set equivalence check is applied between the record witnesses, and a second set of
         * records that are sorted.
         *
         * We apply the following checks for the sorted records:
         *
         * 1. w1, w2, w3 correctly map to 'index', 'v1, 'v2' for a given record value at w4
         * 2. index values for adjacent records are monotonically increasing
         * 3. if, at gate i, index_i == index_{i + 1}, then value1_i == value1_{i + 1} and value2_i == value2_{i + 1}
         *
         */
        ap.index_delta = wire(p, WIRE.W_L_SHIFT) - wire(p, WIRE.W_L);
        ap.record_delta = wire(p, WIRE.W_4_SHIFT) - wire(p, WIRE.W_4);

        ap.index_is_monotonically_increasing = ap.index_delta * ap.index_delta - ap.index_delta; // deg 2

        ap.adjacent_values_match_if_adjacent_indices_match = (ap.index_delta * MINUS_ONE + Fr.wrap(1)) * ap.record_delta; // deg 2

        evals[13] =
            ap.adjacent_values_match_if_adjacent_indices_match * (wire(p, WIRE.Q_L) * wire(p, WIRE.Q_R)) * (wire(p, WIRE.Q_AUX) * powPartialEval); // deg 5
        evals[14] =
            ap.index_is_monotonically_increasing * (wire(p, WIRE.Q_L) * wire(p, WIRE.Q_R)) * (wire(p, WIRE.Q_AUX) * powPartialEval); // deg 5
        
        ap.ROM_consistency_check_identity = ap.memory_record_check * (wire(p, WIRE.Q_L) * wire(p, WIRE.Q_R));        // deg 3 or 7


        /**
         * Contributions 15,16,17
         * RAM Consistency Check
         *
         * The 'access' type of the record is extracted with the expression `w_4 - ap.partial_record_check`
         * (i.e. for an honest Prover `w1 * eta + w2 * eta^2 + w3 * eta^3 - w4 = access`.
         * This is validated by requiring `access` to be boolean
         *
         * For two adjacent entries in the sorted list if _both_
         *  A) index values match
         *  B) adjacent access value is 0 (i.e. next gate is a READ)
         * then
         *  C) both values must match.
         * The gate boolean check is
         * (A && B) => C  === !(A && B) || C ===  !A || !B || C
         *
         * N.B. it is the responsibility of the circuit writer to ensure that every RAM cell is initialized
         * with a WRITE operation.
         */
        Fr access_type = (wire(p, WIRE.W_4) - ap.partial_record_check);             // will be 0 or 1 for honest Prover; deg 1 or 4
        ap.access_check = access_type * access_type - access_type; // check value is 0 or 1; deg 2 or 8

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/757): If we sorted in
        // reverse order we could re-use `ap.partial_record_check`  1 -  ((w3' * eta + w2') * eta + w1') * eta
        // deg 1 or 4
        ap.next_gate_access_type = wire(p, WIRE.W_O_SHIFT) * tp.eta;
        ap.next_gate_access_type = ap.next_gate_access_type + wire(p, WIRE.W_R_SHIFT);
        ap.next_gate_access_type = ap.next_gate_access_type * tp.eta;
        ap.next_gate_access_type = ap.next_gate_access_type + wire(p, WIRE.W_L_SHIFT);
        ap.next_gate_access_type = ap.next_gate_access_type * tp.eta;
        ap.next_gate_access_type = wire(p, WIRE.W_4_SHIFT) - ap.next_gate_access_type;

        Fr value_delta = wire(p, WIRE.W_O_SHIFT) - wire(p, WIRE.W_O);
        ap.adjacent_values_match_if_adjacent_indices_match_and_next_access_is_a_read_operation =
            (ap.index_delta * MINUS_ONE + Fr.wrap(1)) * value_delta * (ap.next_gate_access_type * MINUS_ONE + Fr.wrap(1)); // deg 3 or 6

        // We can't apply the RAM consistency check identity on the final entry in the sorted list (the wires in the
        // next gate would make the identity fail).  We need to validate that its 'access type' bool is correct. Can't
        // do  with an arithmetic gate because of the  `eta` factors. We need to check that the *next* gate's access
        // type is  correct, to cover this edge case
        // deg 2 or 4
        ap.next_gate_access_type_is_boolean = ap.next_gate_access_type * ap.next_gate_access_type - ap.next_gate_access_type;

        // Putting it all together...
        evals[15] =
            ap.adjacent_values_match_if_adjacent_indices_match_and_next_access_is_a_read_operation * (wire(p, WIRE.Q_ARITH)) *
            (wire(p, WIRE.Q_AUX) * powPartialEval); // deg 5 or 8
        evals[16] = ap.index_is_monotonically_increasing * (wire(p, WIRE.Q_ARITH)) * (wire(p, WIRE.Q_AUX) * powPartialEval); // deg 4
        evals[17] =
            ap.next_gate_access_type_is_boolean * (wire(p, WIRE.Q_ARITH)) * (wire(p, WIRE.Q_AUX) * powPartialEval); // deg 4 or 6

        ap.RAM_consistency_check_identity = ap.access_check * (wire(p, WIRE.Q_ARITH));              // deg 3 or 9

        /**
         * RAM Timestamp Consistency Check
         *
         * | w1 | w2 | w3 | w4 |
         * | index | timestamp | timestamp_check | -- |
         *
         * Let delta_index = index_{i + 1} - index_{i}
         *
         * Iff delta_index == 0, timestamp_check = timestamp_{i + 1} - timestamp_i
         * Else timestamp_check = 0
         */
        ap.timestamp_delta = wire(p, WIRE.W_R_SHIFT) - wire(p, WIRE.W_R);
        ap.RAM_timestamp_check_identity = (ap.index_delta * MINUS_ONE + Fr.wrap(1)) * ap.timestamp_delta - wire(p, WIRE.W_O); // deg 3

        /**
         * Complete Contribution 12
         * The complete RAM/ROM memory identity
         * Partial degree:
         */
        ap.memory_identity = ap.ROM_consistency_check_identity;         // deg 3 or 6
        ap.memory_identity = ap.memory_identity +  ap.RAM_timestamp_check_identity * (wire(p, WIRE.Q_4) * wire(p, WIRE.Q_L)); // deg 4
        ap.memory_identity = ap.memory_identity + ap.memory_record_check * (wire(p, WIRE.Q_M) * wire(p, WIRE.Q_L));          // deg 3 or 6
        ap.memory_identity = ap.memory_identity + ap.RAM_consistency_check_identity;             // deg 3 or 9

        // (deg 3 or 9) + (deg 4) + (deg 3)
        ap.auxiliary_identity = ap.memory_identity + non_native_field_identity + limb_accumulator_identity;
        ap.auxiliary_identity = ap.auxiliary_identity * (wire(p, WIRE.Q_AUX) * powPartialEval); // deg 4 or 10
        evals[12] = ap.auxiliary_identity;
    }


    // TODO: convert each of the 4 limb commitments into single limb for accumulation

    function scaleAndBatchSubrelations(Fr[NUMBER_OF_SUBRELATIONS] memory evaluations, Fr[NUMBER_OF_ALPHAS] memory subrelationChallenges ) internal view returns (Fr) {
        Fr accumulator = Fr.wrap(0) ;

        accumulator = accumulator + evaluations[0];

        for (uint256 i = 1; i< NUMBER_OF_SUBRELATIONS; ++i ) {
            accumulator = accumulator + evaluations[i] * subrelationChallenges[i - 1];
        }
        return accumulator;
    }


    function verifyZeroMorph(HonkTypes.Proof memory proof, HonkTypes.VerificationKey memory vk, TranscriptParameters memory tp) internal view returns (bool) {

        // Need:
        // - commitments - unshifted -> in proof
        // - commitments - shifted -> in proof
        // - puported evaluations - unshifted -> in proof
        // - puported evaluations - shifted -> in proof
        // - multivariateChallenge = sumcheck U challenges
        // - transcript

        // Construct batched evaluation v = sum_{i=0}^{m-1}\rho^i*f_i(u) + sum_{i=0}^{l-1}\rho^{m+i}*h_i(u)
        Fr batchedEval = Fr.wrap(0);
        Fr batchedScalar = Fr.wrap(1);
        
        // We linearly combine all evaluations (unshifted first, then shifted)
        
        // TODO: Odd ordering is a workaround work out why cpp has odd ordering over entities
        batchedEval = batchedEval + proof.sumcheckEvaluations[5] * batchedScalar;
        batchedScalar = batchedScalar * tp.rho;

        for (uint256 i = 0; i < 5; ++i){
            batchedEval = batchedEval + proof.sumcheckEvaluations[i] * batchedScalar;
            batchedScalar = batchedScalar * tp.rho;
        }

        for (uint256 i = 6; i < NUMBER_OF_ENTITIES; ++i){
            batchedEval = batchedEval + proof.sumcheckEvaluations[i] * batchedScalar;
            batchedScalar = batchedScalar * tp.rho;
        }
        // TODO: check adding concat evaluations
        
        // Get k commitments
        // TODO: adjust naming
        HonkTypes.G1Point memory c_zeta = computeCZeta(proof, tp);
        logG("c zeta", c_zeta);

        HonkTypes.G1Point memory c_zeta_x = computeCZetaX(proof, vk, tp, batchedEval);
        logG("c zeta x", c_zeta_x);


        HonkTypes.G1Point memory c_zeta_Z = ecAdd(c_zeta, ecMul(c_zeta_x, tp.zmZ));

        logG("c zeta z", c_zeta_Z);
        


        // KZG pairing accumulator
        Fr evaluation = Fr.wrap(0);
        return zkgReduceVerify(proof, tp, evaluation, c_zeta_Z);
    }

    // Compute commitment to lifted degree quotient identity
    function computeCZeta(HonkTypes.Proof memory proof, TranscriptParameters memory tp) internal view returns (HonkTypes.G1Point memory) {
        // 
        Fr[LOG_N + 1] memory scalars;
        // TODO: first commitment must have zm C_q pushed to the front
        HonkTypes.G1ProofPoint[LOG_N + 1] memory commitments;

        // Initial contribution
        commitments[0] = proof.zmCq;
        scalars[0] = Fr.wrap(1);


        // TODO: optimize pow operations here ? batch mul able?

        for (uint256 k = 0; k < LOG_N; ++k) {
            Fr degree = Fr.wrap((1 << k) - 1);
            Fr scalar = FrLib.pow(tp.zmY, k);
            scalar = scalar * FrLib.pow(tp.zmX, (1 << LOG_N) - Fr.unwrap(degree) - 1);
            scalar = scalar * MINUS_ONE;
            logFr("scalar 2: ", scalar);

            scalars[k + 1] = scalar;
            commitments[k + 1] = proof.zmCqs[k];
        }

        for (uint256 k = 0; k < LOG_N + 1; ++k) {
            logFr("zm scalar", k, scalars[k]);
        }


        // Convert all commitments for batch mul
        HonkTypes.G1Point[LOG_N + 1] memory comms = convertPoints(commitments);

        for (uint256 k = 0; k < LOG_N + 1; ++k) {
            logG("zm comms", comms[k]);
        }

        return batchMul(comms, scalars);
    }


    struct CZetaXParams {
        Fr phi_numerator;
        Fr phi_n_x;

        Fr rho_pow;
        
        Fr phi_1;
        Fr phi_2;

        Fr x_pow_2k;
        Fr x_pow_2kp1;
    }
    function computeCZetaX(HonkTypes.Proof memory proof, HonkTypes.VerificationKey memory vk, TranscriptParameters memory tp, Fr batchedEval) internal view returns (HonkTypes.G1Point memory) {
        Fr[NUMBER_OF_ENTITIES + LOG_N + 1] memory scalars;        
        HonkTypes.G1Point[NUMBER_OF_ENTITIES + LOG_N + 1] memory commitments;
        CZetaXParams memory cp;

        // Phi_n(x) = (x^N - 1) / (x - 1)
        cp.phi_numerator = FrLib.pow(tp.zmX, (1 << LOG_N)) - Fr.wrap(1);
        cp.phi_n_x = FrLib.div(cp.phi_numerator, tp.zmX - Fr.wrap(1));

        // Add contribution: -v * x * \Phi_n(x) * [1]_1
        // Add base 
        logFr(" batched eval",batchedEval);
        scalars[0] = MINUS_ONE * batchedEval * tp.zmX * cp.phi_n_x;
        commitments[0] = HonkTypes.G1Point({x: 1, y: 2}); // One

        // f - Add all unshifted commitments
        // g - Add add to be shifted commitments

        // f commitments are accumulated at (zm_x * r)
        cp.rho_pow = Fr.wrap(1);
        for (uint256 i = 1; i < 33; ++i) {
            scalars[i] = tp.zmX * cp.rho_pow;
            cp.rho_pow = cp.rho_pow * tp.rho;
        }
        // g commitments are accumulated at r
        for (uint256 i = 33; i < 44; ++i) {
            scalars[i] = cp.rho_pow;
            cp.rho_pow = cp.rho_pow * tp.rho;
        }

        // TODO: dont accumulate these into the comms array, just accumulate directly
        commitments[1] = vk.qm;
        commitments[2] = vk.qc;
        commitments[3] = vk.ql;
        commitments[4] = vk.qr;
        commitments[5] = vk.qo;
        commitments[6] = vk.q4;
        commitments[7] = vk.qArith;
        commitments[8] = vk.qSort;
        commitments[9] = vk.qElliptic;
        commitments[10] = vk.qAux;
        commitments[11] = vk.qLookup;
        commitments[12] = vk.s1;
        commitments[13] = vk.s2;
        commitments[14] = vk.s3;
        commitments[15] = vk.s4;
        commitments[16] = vk.id1;
        commitments[17] = vk.id2;
        commitments[18] = vk.id3;
        commitments[19] = vk.id4;
        commitments[20] = vk.t1;
        commitments[21] = vk.t2;
        commitments[22] = vk.t3;
        commitments[23] = vk.t4;
        commitments[24] = vk.lagrangeFirst;
        commitments[25] = vk.lagrangeLast;

        // Accumulate proof points 
        commitments[26] = convertProofPoint(proof.w1);
        commitments[27] = convertProofPoint(proof.w2);
        commitments[28] = convertProofPoint(proof.w3);
        commitments[29] = convertProofPoint(proof.w4);
        commitments[30] = convertProofPoint(proof.sortedAccum);
        commitments[31] = convertProofPoint(proof.zPerm);
        commitments[32] = convertProofPoint(proof.zLookup);

        // to be Shifted
        commitments[33] = vk.t1;
        commitments[34] = vk.t2;
        commitments[35] = vk.t3;
        commitments[36] = vk.t4;
        commitments[37] = convertProofPoint(proof.w1);
        commitments[38] = convertProofPoint(proof.w2);
        commitments[39] = convertProofPoint(proof.w3);
        commitments[40] = convertProofPoint(proof.w4);
        commitments[41] = convertProofPoint(proof.sortedAccum);
        commitments[42] = convertProofPoint(proof.zPerm);
        commitments[43] = convertProofPoint(proof.zLookup);

        // Add scalar contributions
        // Add contributions: scalar * [q_k],  k = 0,...,log_N, where
        // scalar = -x * (x^{2^k} * \Phi_{n-k-1}(x^{2^{k+1}}) - u_k * \Phi_{n-k}(x^{2^k}))
        cp.x_pow_2k = tp.zmX;
        cp.x_pow_2kp1 = tp.zmX * tp.zmX;
        for (uint256 k; k < LOG_N; ++k) {
            cp.phi_1 = FrLib.div(cp.phi_numerator, cp.x_pow_2kp1 - Fr.wrap(1));
            cp.phi_2 = FrLib.div(cp.phi_numerator, cp.x_pow_2k - Fr.wrap(1));

            Fr scalar = cp.x_pow_2k * cp.phi_1;
            scalar = scalar - (tp.sumCheckUChallenges[k] * cp.phi_2);
            scalar = scalar * tp.zmX;
            scalar = scalar * MINUS_ONE;

            scalars[44 + k] = scalar;
            commitments[44 + k] = convertProofPoint(proof.zmCqs[k]);

            cp.x_pow_2k = cp.x_pow_2kp1;
            cp.x_pow_2kp1 = cp.x_pow_2kp1 * cp.x_pow_2kp1;
        }

        console.log("all commitments");
        for (uint256 i; i < NUMBER_OF_ENTITIES + LOG_N + 1; ++i) {
            logG("comm", commitments[i]);
        }

        console.log("all scalars");
        for (uint256 i; i < NUMBER_OF_ENTITIES + LOG_N + 1; ++i) {
            logFr("scalars", scalars[i]);
        }

        // TODO: deal with batch mul 2 thingy
        return batchMul2(commitments, scalars);
    }

    // TODO: TODO: TODO: optimize 
    // Scalar Mul and acumulate into total
    function batchMul(HonkTypes.G1Point[LOG_N + 1] memory base, Fr[LOG_N + 1] memory scalars) internal view returns (HonkTypes.G1Point memory result) {
        // TODO: check if i actually need to do the memory copies here
        uint256 limit = LOG_N + 1;
        assembly {
            let success := 0x01

            let free := mload(0x40)

            // Write the original into the accumulator
            // Load into memory for ecMUL, leave offset for eccAdd result
            // base is an array of pointers, so we have to dereference them
            mstore(add(free, 0x40), mload(mload(base)))
            mstore(add(free, 0x60), mload(add(0x20, mload(base))))
            // Add scalar
            mstore(add(free, 0x80), mload(scalars))
            success := and(success, staticcall(gas(), 7, add(free, 0x40), 0x60, free, 0x40))

            let count := 0x01

            // TODO: optimize
            for {} lt(count, limit) { count := add(count, 1) } {
                // Get loop offsets
                let base_base := add(base, mul(count, 0x20))
                let scalar_base := add(scalars, mul(count, 0x20))

                mstore(add(free, 0x40), mload(mload(base_base)))
                mstore(add(free, 0x60), mload(add(0x20, mload(base_base))))
                // Add scalar
                mstore(add(free, 0x80), mload(scalar_base))

                success := and(success, staticcall(gas(), 7, add(free, 0x40), 0x60, add(free, 0x40), 0x40))
                // accumulator = accumulator + accumulator_2
                success := and(success, staticcall(gas(), 6, free, 0x80, free, 0x40))
            }

            // Return the result - i hate this
            mstore(result, mload(free))
            mstore(add(result, 0x20), mload(add(free, 0x20)))
        }
    }

    function batchMul2(HonkTypes.G1Point[NUMBER_OF_ENTITIES + LOG_N + 1] memory base, Fr[NUMBER_OF_ENTITIES + LOG_N + 1] memory scalars) internal view returns (HonkTypes.G1Point memory result) {
        // TODO: check if i actually need to do the memory copies here
        uint256 limit = NUMBER_OF_ENTITIES + LOG_N + 1;
        assembly {
            let success := 0x01

            let free := mload(0x40)

            // Write the original into the accumulator
            // Load into memory for ecMUL, leave offset for eccAdd result
            // base is an array of pointers, so we have to dereference them
            mstore(add(free, 0x40), mload(mload(base)))
            mstore(add(free, 0x60), mload(add(0x20, mload(base))))
            // Add scalar
            mstore(add(free, 0x80), mload(scalars))
            success := and(success, staticcall(gas(), 7, add(free, 0x40), 0x60, free, 0x40))

            let count := 0x01

            // TODO: optimize
            for {} lt(count, limit) { count := add(count, 1) } {
                // Get loop offsets
                let base_base := add(base, mul(count, 0x20))
                let scalar_base := add(scalars, mul(count, 0x20))

                mstore(add(free, 0x40), mload(mload(base_base)))
                mstore(add(free, 0x60), mload(add(0x20, mload(base_base))))
                // Add scalar
                mstore(add(free, 0x80), mload(scalar_base))

                success := and(success, staticcall(gas(), 7, add(free, 0x40), 0x60, add(free, 0x40), 0x40))
                // accumulator = accumulator + accumulator_2
                success := and(success, staticcall(gas(), 6, free, 0x80, free, 0x40))
            }

            // Return the result - i hate this
            mstore(result, mload(free))
            mstore(add(result, 0x20), mload(add(free, 0x20)))
        }
    }

    function convertPoints(HonkTypes.G1ProofPoint[LOG_N + 1] memory commitments) internal pure returns (HonkTypes.G1Point[LOG_N + 1] memory converted) {
        for (uint256 i; i < LOG_N + 1; ++i) {
            converted[i] = convertProofPoint(commitments[i]);
        }
    }

    function convertProofPoint(HonkTypes.G1ProofPoint memory input) internal pure returns (HonkTypes.G1Point memory) {
        return HonkTypes.G1Point({
                x: input.x_0 | (input.x_1 << 136),
                y: input.y_0 | (input.y_1 << 136)
            });
    }


    function ecMul(HonkTypes.G1Point memory point, Fr scalar) internal view returns (HonkTypes.G1Point memory) {
        bytes memory input = abi.encodePacked(point.x, point.y, Fr.unwrap(scalar));
        (bool success, bytes memory result) = address(0x07).staticcall(input);
        require(success, "ecMul failed");

        (uint256 x, uint256 y) = abi.decode(result, (uint256, uint256));
        return HonkTypes.G1Point({x:x,y:y});
    }

    function ecAdd(HonkTypes.G1Point memory point0, HonkTypes.G1Point memory point1) internal view returns (HonkTypes.G1Point memory) {
        bytes memory input = abi.encodePacked(point0.x, point0.y, point1.x, point1.y);
        (bool success, bytes memory result) = address(0x06).staticcall(input);
        require(success, "ecAdd failed");

        (uint256 x, uint256 y) = abi.decode(result, (uint256, uint256));
        return HonkTypes.G1Point({x:x,y:y});
    }

    function ecSub(HonkTypes.G1Point memory point0, HonkTypes.G1Point memory point1) internal view returns (HonkTypes.G1Point memory) {
        // We negate the second point
        uint256 negativePoint1Y = (Q - point1.y) % Q;
        bytes memory input = abi.encodePacked(point0.x, point0.y, point1.x, negativePoint1Y);
        (bool success, bytes memory result) = address(0x06).staticcall(input);
        require(success, "ecAdd failed");

        (uint256 x, uint256 y) = abi.decode(result, (uint256, uint256));
        return HonkTypes.G1Point({x:x,y:y});
    }

    function negateInplace(HonkTypes.G1Point memory point) internal pure returns (HonkTypes.G1Point memory) {
        point.y = (Q - point.y) % Q;
        return point;
    }


    function zkgReduceVerify(HonkTypes.Proof memory proof, TranscriptParameters memory tp, Fr evaluation, HonkTypes.G1Point memory commitment) internal view returns (bool) {
        // Get KZG_W from the prover??? what is that zmPi?
        HonkTypes.G1Point memory quotient_commitment = convertProofPoint(proof.zmPi);

        logG("claim Comm", commitment);
        logFr("zm X", tp.zmX);
        logFr("evaluation", evaluation);
        logG("quotient Comm", quotient_commitment);

        // ec add
        HonkTypes.G1Point memory ONE = HonkTypes.G1Point({x:1, y:2});
        console.log("0");

        HonkTypes.G1Point memory P0 = commitment;
        logG("P0 0", P0);

        P0 = ecAdd(P0, ecMul(quotient_commitment, tp.zmX));
        logG("P0 1", P0);
        console.log("1");
        HonkTypes.G1Point memory evalAsPoint = ecMul(ONE, evaluation);
        console.log("2");
        P0 = ecSub(P0, evalAsPoint);
        logG("P0 2", P0);
        console.log("1");
        console.log("3");

        // ec mul
        HonkTypes.G1Point memory P1 = negateInplace(quotient_commitment);
        console.log("4");


        logG("P0", P0);
        logG("P1", P1);

        // Perform pairing check

        // P0 = rhs
        // P1 = lhs

        return pairing(P0, P1);
        
    }

    function pairing(HonkTypes.G1Point memory rhs, HonkTypes.G1Point memory lhs) internal view returns (bool) {
        
        bytes memory input = abi.encodePacked(
            rhs.x, rhs.y, 

            uint256(0x198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2),
            uint256(0x1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed),
            uint256(0x090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b),
            uint256(0x12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa),

            lhs.x, lhs.y,

            uint256(0x260e01b251f6f1c7e7ff4e580791dee8ea51d87a358e038b4efe30fac09383c1),
            uint256(0x0118c4d5b837bcc2bc89b5b398b5974e9f5944073b32078b7e231fec938883b0),
            uint256(0x04fc6369f7110fe3d25156c1bb9a72859cf2a04641f99ba4ee413c80da6a5fe4),
            uint256(0x22febda3c0c0632a56475b4214e5615e11e6dd3f96e6cea2854a87d4dacc5e55)
        );

        (bool success, bytes memory result) = address(0x08).staticcall(input);
        return abi.decode(result, (bool));
    }

}
