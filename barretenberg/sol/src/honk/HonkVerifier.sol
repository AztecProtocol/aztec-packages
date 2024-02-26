


/// Smart contract verifier of honk proofs
contract HonkVerifier {

    /// Plan of action
    /// We want to implement the non goblinised version of the protocol

    /// 0. Implement loading the verification key

    /// 1. Generate challenges 
    /// 2. Perform the public inputs delta calculations

    /// 3. Implement the sumcheck verifier
    /// 4. Implement the zero morph verifier

    // TODO: increase this number accordingly
    uint256 constant NUMBER_OF_SUBRELATIONS = 4;
    uint256 constant BATCHED_RELATION_PARTIAL_LENGTH = 7;
    uint256 constant NUMBER_OF_ENTITIES = 43;

    /// Log of the circuit size - precomputed
    uint256 constant LOG_N = 4;

    struct Proof {
        // Free wires
        uint256 w1;
        uint256 w2;
        uint256 w3;
        uint256 w4;

        // Lookup helpers - classic plookup
        uint256 sortedAccum;
        uint256 zPerm;
        uint256 zLookup;

        // Sumcheck
        // TODO: [uinvariate[batched_relation_partial_length]] - not sure how to represent a univariate
        uint256[LOG_N][BATCHED_RELATION_PARTIAL_LENGTH] sumcheckUnivariates;
        uint256[NUMBER_OF_ENTITIES] sumcheckEvaluations;

        // Zero morph
        uint256[LOG_N] zmCqs;
        uint256 zmCq;
        uint256 zmPi;
    }

    struct VerificationKey {
        // Misc Params
        uint256 circuitSize;
        uint256 publicInputsSize;
        uint256 publicInputsOffset;

        // Selectors
        uint256 qm;
        uint256 qc;
        uint256 ql;
        uint256 qr;
        uint256 qo;
        uint256 q4;
        uint256 qArith; // Arithmetic widget
        uint256 qSort; // Gen perm sort
        uint256 qAux; // Auxillary
        uint256 qLookup; // Lookup
        // Copy constraints
        uint256 s1;
        uint256 s2;
        uint256 s3;
        uint256 s4;
        // Copy identity
        uint256 id1;
        uint256 id2;
        uint256 id3;
        uint256 id4;
        // Precomputed lookup table
        uint256 t1;
        uint256 t2;
        uint256 t3;
        uint256 t4;
        // Fixed first and last 
        uint256 lagrangeFirst;
        uint256 lagrangeLast;
    }

    struct ProofParameters {
        uint256 logCircuitSize;

    }


    struct TranscriptParameters {
        // Relation Challenges
        uint256[] alphas;
        uint256[] gateChallenges;

        // perm challenges
        uint256 beta;
        uint256 gamma;
        uint256 eta; // Challenge for sorted list batching and w4 memory records
        uint256 publicInputsDelta;
        uint256 lookupGrandProductDelta;
    }

    /// Check how the challenges are calculated on the otherside

    function loadVerificationKey() internal returns (VerificationKey memory) {
        // Load the verification key -> this can be hardcoded

    } 


    function loadProof() internal returns (Proof memory) {
        // Load the proof -> this will be dymanic
    }



    error PublicInputsLengthWrong();

    function verify(bytes calldata proof, uint256[] calldata publicInputs) public returns (bool) {
        VerificationKey memory vk = loadVerificationKey();
        Proof memory p = loadProof();

        if (vk.publicInputsSize != publicInputs.length) {
            revert PublicInputsLengthWrong();
        }

        // Perform each of the rounds 
        TranscriptParameters memory tp = computeChallenges(p, publicInputs);

        // Compute the public input delta
        uint256 publicInputDelta = computePublicInputDelta(
            publicInputs, 
            tp.beta, 
            tp.gamma,
            vk.circuitSize,
            vk.publicInputsOffset
        );

        uint256 grandProductPlookupDelta = computeLookupGrandProductDelta(
            tp.beta,
            tp.gamma,
            vk.circuitSize
        );


    }

    function computeChallenges(Proof memory proof, VerificationKey memory vk, uint256[] calldata publicInputs) {
        TranscriptParameters memory tp;

        // We generate the first challenge by hashing the public inputs
        // TODO: check the length here
        bytes32[3 + publicInputs.length] memory round0;
        round0[0] = bytes32(vk.circuitSize);
        round0[1] = bytes32(vk.publicInputsSize);
        round0[2] = bytes32(vk.publicInputsOffset);
        for (uint256 i = 0; i < publicInputs.length; i++) {
            round0[3 + i] = bytes32(publicInputs[i]);
        }

        // Create the first challenge
        // Note: w4 is added to the challenge later on
        round0[3 + publicInputs.length] = bytes32(proof.w1);
        round0[3 + publicInputs.length + 1] = bytes32(proof.w2);
        round0[3 + publicInputs.length + 2] = bytes32(proof.w3);

        uint256 eta = uint256(keccak256(abi.encodePacked(round0)));

        // We generate the beta and gamma challenges by appending eta with the sorted_accumulator and w4
        bytes32[3] memory round1;
        round1[0] = bytes32(eta);
        round1[1] = bytes32(proof.sortedAccum);
        round1[1] = bytes32(proof.w4);

        uint256 beta = uint256(keccak256(abi.encodePacked(round1)));

        // We generate the gamma challenge by hashing beta
        // TODO: Check this is how we create spare challenges 
        uint256 gamma = uint256(keccak256(abi.encodePacked(beta))); 

        // WORKTODO: there are more items pushed to the sumcheck challenges 1
        uint256[NUMBER_OF_SUBRELATIONS] memory alphas = generateAlphaChallenges(gamma);
        tp.alphas = alphas;

        uint256[LOG_N] memory gate_challenges = generateGateChallenges(alphas[NUMBER_OF_SUBRELATIONS - 1]);
        tp.gate_challenges = gate_challenges;

        uint256[LOG_N] sumCheckUChallenges = generateSumcheckChallenges(proof, gate_challenges[LOG_N - 1]);
        uint256 rhoChallenge = generateRhoChallenge(proof, sumCheckUChallenges[LOG_N - 1]);

        uint256 zmY = generateZmYChallenge(proof, rhoChallenge);



    }

    // Alpha challenges non-linearise the gate contributions 
    function generateAlphaChallenges(uint256 previousChallenge) internal returns (uint256[] memory) {
        uint256[NUMBER_OF_SUBRELATIONS] memory alphas;
        uint256 prevChallenge = previousChallenge;
        for (uint256 i = 0; i < NUMBER_OF_SUBRELATIONS; i++) {
            prevChallenge = uint256(keccak256(bytes32(prevChallenge)));
            alphas[i] = prevChallenge;
        }
        return alphas;
    }

    function generateGateChallenges(uint256 previousChalenge) internal returns (uint256[] memory) {
        uint256[LOG_N] memory gate_challanges;
        uint256 prevChallenge = previousChalenge;
        for (uint256 i = 0; i < LOG_N; i++) {
            prevChallenge = uint256(keccak256(bytes32(prevChallenge)));
            gate_challanges[i] = prevChallenge;
        }
        return gate_challanges;
    }

    function generateSumcheckChallenges(Proof memory proof, uint256 prevChallenge) internal return (uint256[] memory) {
        uint256[LOG_N] memory sumcheckChallenges;
        uint256 prevChallenge = prevChallenge;
        for (uint256 i = 0; i < LOG_N; i++) {
            uint256[BATCHED_RELATION_PARTIAL_LENGTH + 1] memory multivariateChal;
            multivariateChal[0] = prevChallenge;

            // TODO(opt): memcpy
            for (uint256 j = 0; j < BATCHED_RELATION_PARTIAL_LENGTH; j++) {
                multivariateChal[j + 1] = proof.sumcheckUnivariates[i][j];
            }

            sumcheckChallenges = uint256(keccak256(multivariate));
        }

        return sumcheckChallenges;
    }

    function generateRhoChallenge(Proof memory proof, prevChallenge) internal return (uint256) {
        uint256[NUMBER_OF_ENTITIES + 1] rhoChallengeElements;
        rhoChallengeElements[0] = prevChallenge;

        // TODO: memcpy
        for (uint256 i = 0; i < NUMBER_OF_ENTITIES; i++) {
            rhoChallengeElements[i + 1] = proof.sumcheckEvaluations[i];
        }
        return uint256(keccak256(rhoChallengeElements));
    }

    // We add an offset to the public inputs, this adds the values of our public inputs
    // to the copy constraints
    function computePublicInputDelta(uint256[] memory publicInputs, uint256 beta, uint256 gamma, 
        // TODO: check how to deal with this Domain size and offset are somewhat new 
        uint256 domainSize, uint256 offset
    ) internal returns (uint256) {
        uint256 numerator = 1;
        uint256 denominator = 1;

        // TODO: all of this needs to be mod p
        uint256 numeratorAcc = gamma + beta * (domainSize + offset);
        uint256 denominatorAcc = gamma - beta * (offset + 1);

        for (uint256 i = 0; i < publicInputs.length; i++) {
            numerator = numerator * (numeratorAcc + publicInputs[i]);
            denominator = denominator * (denominatorAcc + publicInputs[i]);

            // TODO: mod p
            numeratorAcc += beta;
            denominatorAcc -= beta;
        }
        // mod p this shit
        return numerator / denominator;
    }

    // Incorportate the original plookup construction into honk
    function computeLookupGrandProductDelta(uint256 beta, uint256 gamma, 
        // Again double check - i think it comes from the proving key
        uint256 domainSize
    ) internal returns (uint256) {
        uint256 gammaByOnePlusBeta = gamma * (beta + 1);
        return gammaByOnePlusBeta ** domainSize;
    }

    function verifySumcheck() {}

    function verifyZeroMorph() {}

}