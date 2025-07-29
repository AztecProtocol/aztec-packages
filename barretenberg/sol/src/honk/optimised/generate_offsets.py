

## A mini python script to help generate the locations in memory of the indicies requred to generate a proof

vk_fr = [
    "VK_CIRCUIT_SIZE_LOC",
    "VK_NUM_PUBLIC_INPUTS_LOC",
    "VK_PUB_INPUTS_OFFSET_LOC",
]

vk_g1 = [
    "Q_M",
    "Q_C",
    "Q_L",
    "Q_R",
    "Q_O",
    "Q_4",
    "Q_LOOKUP",
    "Q_ARITH",
    "Q_DELTA_RANGE",
    "Q_ELLIPTIC",
    "Q_MEMORY",
    "Q_NNF",
    "Q_POSEIDON_2_EXTERNAL",
    "Q_POSEIDON_2_INTERNAL",
    "SIGMA_1",
    "SIGMA_2",
    "SIGMA_3",
    "SIGMA_4",
    "ID_1",
    "ID_2",
    "ID_3",
    "ID_4",
    "TABLE_1",
    "TABLE_2",
    "TABLE_3",
    "TABLE_4",
    "LAGRANGE_FIRST",
    "LAGRANGE_LAST"
]

proof_fr = [
    "PROOF_CIRCUIT_SIZE",
    "PROOF_NUM_PUBLIC_INPUTS",
    "PROOF_PUB_INPUTS_OFFSET",
]

pairing_points = [
    "PAIRING_POINT_0",
    "PAIRING_POINT_1",
    "PAIRING_POINT_2",
    "PAIRING_POINT_3",
    "PAIRING_POINT_4",
    "PAIRING_POINT_5",
    "PAIRING_POINT_6",
    "PAIRING_POINT_7",
    "PAIRING_POINT_8",
    "PAIRING_POINT_9",
    "PAIRING_POINT_10",
    "PAIRING_POINT_11",
    "PAIRING_POINT_12",
    "PAIRING_POINT_13",
    "PAIRING_POINT_14",
    "PAIRING_POINT_15",
]

proof_g1 = [
    "W_L",
    "W_R",
    "W_O",
    "LOOKUP_READ_COUNTS",
    "LOOKUP_READ_TAGS",
    "W_4",
    "LOOKUP_INVERSES",
    "Z_PERM",
]

entities = [
    "QM",
    "QC",
    "QL",
    "QR",
    "QO",
    "Q4",
    "QLOOKUP",
    "QARITH",
    "QRANGE",
    "QELLIPTIC",
    "QMEMORY",
    "QNNF",
    "QPOSEIDON2_EXTERNAL",
    "QPOSEIDON2_INTERNAL",
    "SIGMA1",
    "SIGMA2",
    "SIGMA3",
    "SIGMA4",
    "ID1",
    "ID2",
    "ID3",
    "ID4",
    "TABLE1",
    "TABLE2",
    "TABLE3",
    "TABLE4",
    "LAGRANGE_FIRST",
    "LAGRANGE_LAST",
    "W1",
    "W2",
    "W3",
    "W4",
    "Z_PERM",
    "LOOKUP_INVERSES",
    "LOOKUP_READ_COUNTS",
    "LOOKUP_READ_TAGS",
    "W1_SHIFT",
    "W2_SHIFT",
    "W3_SHIFT",
    "W4_SHIFT",
    "Z_PERM_SHIFT"
]

challenges = [
    # Sumcheck + relations
    "ETA",
    "ETA_TWO",
    "ETA_THREE",
    "BETA",
    "GAMMA",
    "RHO",

    # shplemini
    "GEMINI_R",
    "SHPLONK_NU",
    "SHPLONK_Z",

    # public inputs
    "PUBLIC_INPUTS_DELTA_NUMERATOR",
    "PUBLIC_INPUTS_DELTA_DENOMINATOR"
]

START_POINTER = 0x1000
SCRATCH_SPACE_POINTER = 0x100


def print_header_centered(text: str):
    top = "/*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/"
    bottom = "/*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/"
    # The width of the bar is the length of the top/bottom string
    width = len(top) - 4  # exclude /* and */
    # Center the text, with "/*" and "*/" at the ends
    centered = "/*" + text.center(width) + "*/"
    print("")
    print(top)
    print(centered)
    print(bottom)


# Generate the verification key memory locations, leaving plenty of room for scratch space

def print_loc(pointer: int, name: str):
    print("uint256 internal constant ", name, " = ", hex(pointer), ";")


def print_fr(pointer:int , name: str):
    print_loc(pointer, name)

# Smalle g1 is releavant to the points in the verification key
def print_small_g1(pointer:int, name: str):
    print_loc(pointer, name + "_X_LOC")
    print_loc(pointer + 32, name + "_Y_LOC")

def print_g1(pointer: int, name: str):
    print_loc(pointer, name + "_X0_LOC")
    print_loc(pointer + 32, name + "_X1_LOC")
    print_loc(pointer + 64, name + "_Y0_LOC")
    print_loc(pointer + 96, name + "_Y1_LOC")


def print_vk(pointer: int):
    for item in vk_fr:
        print_fr(pointer, item)
        pointer += 32

    for item in vk_g1:
        print_small_g1(pointer, item)
        pointer += (4*32)

    return pointer

def print_proof(pointer: int):
    for item in pairing_points:
        print_fr(pointer, item)
        pointer += 32

    # for item in proof_fr:
    #     print_fr(pointer, item)
    #     pointer += 32

    for item in proof_g1:
        print_g1(pointer, item)
        pointer += (4*32)

    return pointer

BATCHED_RELATION_PARTIAL_LENGTH = 8
PROOF_SIZE_LOG_N = 28
NUMBER_OF_ENTITIES = 41
NUMBER_OF_SUBRELATIONS = 28
NUMBER_OF_ALPHAS = NUMBER_OF_SUBRELATIONS - 1
# For the meantime we will load the entire proof into memory here
# however i predict that it will be more efficient to load in the sumcheck univars
# for each round with their own slice of calldatacopy
def print_sumcheck_univariates(pointer: int):
    for relation_len in range(0, BATCHED_RELATION_PARTIAL_LENGTH):
        for size in range(0, PROOF_SIZE_LOG_N):
            name = "SUMCHECK_UNIVARIATE_" + str(relation_len) + "_" + str(size) + "_LOC"
            print_fr(pointer, name)
            pointer += 32

    return pointer

def print_entities(pointer: int):
    for entity in entities:
        print_fr(pointer, entity + "_EVAL_LOC")
        pointer += 32

    return pointer


def print_shplemini(pointer: int):
    print_header_centered("PROOF INDICIES - GEMINI FOLDING COMMS")
    for size in range(0, PROOF_SIZE_LOG_N - 1):
        print_g1(pointer, "GEMINI_FOLD_UNIVARIATE_" + str(size))
        pointer += (4*32)

    print_header_centered("PROOF INDICIES - GEMINI FOLDING EVALUATIONS")
    for size in range(0, PROOF_SIZE_LOG_N):
        print_fr(pointer, "GEMINI_A_EVAL_" + str(size))
        pointer += 32

    print_g1(pointer, "SHPLONK_Q")
    pointer += (4*32)
    print_g1(pointer, "KZG_QUOTIENT")
    pointer += (4*32)

    return pointer

def print_challenges(pointer: int):
    for chall in challenges:
        print_fr(pointer, chall + "_CHALLENGE")
        pointer += 32

    for alpha in range(0, NUMBER_OF_ALPHAS):
        print_fr(pointer, "ALPHA_CHALLENGE_" + str(alpha))
        pointer += 32

    # TODO: this NOT THE PROOF SIZE LOG_N?????
    for gate in range(0, PROOF_SIZE_LOG_N):
        print_fr(pointer, "GATE_CHALLENGE_" + str(gate))
        pointer += 32

    for sum_u in range(0, PROOF_SIZE_LOG_N):
        print_fr(pointer, "SUM_U_CHALLENGE_" + str(sum_u))
        pointer += 32

    return pointer

BARYCENTRIC_DOMAIN_SIZE = 8
def print_barycentric_domain():
    # use scratch space
    bary_pointer = SCRATCH_SPACE_POINTER
    for i in range(0, BARYCENTRIC_DOMAIN_SIZE):
        print_fr(bary_pointer, "BARYCENTRIC_LAGRANGE_DENOMINATOR_" + str(i) + "_LOC")
        bary_pointer += 32

    for i in range(0, PROOF_SIZE_LOG_N):
        for j in range(0, BARYCENTRIC_DOMAIN_SIZE):
            print_fr(bary_pointer, "BARYCENTRIC_DENOMINATOR_INVERSES_" + str(i) + "_" + str(j) + "_LOC")
            bary_pointer += 32


def print_subrelation_eval(pointer: int):
    for i in range(0, NUMBER_OF_SUBRELATIONS):
        print_fr(pointer, "SUBRELATION_EVAL_" + str(i) + "_LOC")
        pointer += 32

    return pointer

subrelation_intermediates = [
    "AUX_NON_NATIVE_FIELD_IDENTITY",
    "AUX_LIMB_ACCUMULATOR_IDENTITY",
    "AUX_RAM_CONSISTENCY_CHECK_IDENTITY",
    "AUX_ROM_CONSISTENCY_CHECK_IDENTITY",
    "AUX_MEMORY_CHECK_IDENTITY"
]

general_intermediates = [
    "FINAL_ROUND_TARGET_LOC",
    "POW_PARTIAL_EVALUATION_LOC",
]


def print_subrelation_intermediates(pointer: int):
    for item in general_intermediates:
        print_fr(pointer, item)
        pointer += 32

    for item in subrelation_intermediates:
        print_fr(pointer, item)
        pointer += 32

    return pointer

def print_batch_scalars(pointer: int):
    BATCH_SIZE = 69
    for i in range(0, BATCH_SIZE):
        print_fr(pointer, "BATCH_SCALAR_" + str(i) + "_LOC")
        pointer += 32

    return pointer

def print_powers_of_evaluation_challenge(pointer: int):
    for i in range(0, PROOF_SIZE_LOG_N):
        print_fr(pointer, "POWERS_OF_EVALUATION_CHALLENGE_" + str(i) + "_LOC")
        pointer += 32
    return pointer

def print_inverted_gemini_denominators(pointer: int):
    for i in range(0, PROOF_SIZE_LOG_N + 1):
        print_fr(pointer, "INVERTED_GEMINI_DENOMINATOR_" + str(i) + "_LOC")
        pointer += 32
    return pointer

# TODO: double check this value
def print_batched_evaluation_accumulator_inversions(pointer: int):
    BATCH_SIZE = 15
    for i in range(0, BATCH_SIZE):
        print_fr(pointer, "BATCH_EVALUATION_ACCUMULATOR_INVERSION_" + str(i) + "_LOC")
        pointer += 32
    return pointer

def print_batched_evaluation_location(pointer: int):
    print_fr(pointer, "BATCHED_EVALUATION_LOC")
    pointer += 32
    return pointer

def print_constant_term_accumulator_location(pointer: int):
    print_fr(pointer, "CONSTANT_TERM_ACCUMULATOR_LOC")
    pointer += 32
    return pointer

def print_inversions():
    pointer = SCRATCH_SPACE_POINTER
    pointer = print_inverted_gemini_denominators(pointer)
    pointer = print_batched_evaluation_accumulator_inversions(pointer)

    print("")
    pointer = print_batched_evaluation_location(pointer)
    pointer = print_constant_term_accumulator_location(pointer)

    print("")
    pointer = print_pos_neg_inverted_denominators(pointer)

    print("")
    print("// LOG_N challenge pow minus u")
    pointer = print_inverted_challenge_pow_minus_u(pointer)

    print("")
    print("// LOG_N pos_inverted_off")
    pointer = print_pos_inverted_denom(pointer)

    print("")
    print("// LOG_N neg_inverted_off")
    pointer = print_neg_inverted_denom(pointer)

    print("")
    pointer = print_fold_pos_evaluations(pointer)



def print_pos_neg_inverted_denominators(pointer: int):
    print_fr(pointer, "POS_INVERTED_DENOMINATOR")
    pointer += 32
    print_fr(pointer, "NEG_INVERTED_DENOMINATOR")
    pointer += 32
    return pointer

def print_inverted_challenge_pow_minus_u(pointer: int):
    for i in range(0, PROOF_SIZE_LOG_N):
        print_fr(pointer, "INVERTED_CHALLENEGE_POW_MINUS_U_" + str(i) + "_LOC")
        pointer += 32
    return pointer

def print_pos_inverted_denom(pointer: int):
    for i in range(0, PROOF_SIZE_LOG_N):
        print_fr(pointer, "POS_INVERTED_DENOM_" + str(i) + "_LOC")
        pointer += 32
    return pointer

def print_neg_inverted_denom(pointer: int):
    for i in range(0, PROOF_SIZE_LOG_N):
        print_fr(pointer, "NEG_INVERTED_DENOM_" + str(i) + "_LOC")
        pointer += 32
    return pointer

def print_fold_pos_evaluations(pointer: int):
    for i in range(0, PROOF_SIZE_LOG_N):
        print_fr(pointer, "FOLD_POS_EVALUATIONS_" + str(i) + "_LOC")
        pointer += 32
    return pointer

def print_later_scratch_space(pointer: int):
    print_fr(pointer, "LATER_SCRATCH_SPACE")
    pointer += 32
    return pointer

def print_temp_space(pointer: int):
    for i in range(0, 3 * PROOF_SIZE_LOG_N):
        print_fr(pointer, "TEMP_" + str(i) + "_LOC")
        pointer += 32
    return pointer

def print_scratch_space_aliases():
    print("")
    print("// Aliases for scratch space")
    print("// TODO: work out the stack scheduling for these")
    print_fr(0x00, "CHALL_POW_LOC")
    print_fr(0x20, "SUMCHECK_U_LOC")
    print_fr(0x40, "GEMINI_A_LOC")
    print("")
    print_fr(0x00, "SS_POS_INV_DENOM_LOC")
    print_fr(0x20, "SS_NEG_INV_DENOM_LOC")
    print_fr(0x40, "SS_GEMINI_EVALS_LOC")

def print_ec_aliases():
    print("")
    print("")
    print("// Aliases")
    print("// Aliases for wire values (Elliptic curve gadget)")

    print_header_centered("SUMCHECK - MEMORY ALIASES")
    print("uint256 internal constant EC_X_1 = W2_EVAL_LOC;")
    print("uint256 internal constant EC_Y_1 = W3_EVAL_LOC;")
    print("uint256 internal constant EC_X_2 = W1_SHIFT_EVAL_LOC;")
    print("uint256 internal constant EC_Y_2 = W4_SHIFT_EVAL_LOC;")
    print("uint256 internal constant EC_Y_3 = W3_SHIFT_EVAL_LOC;")
    print("uint256 internal constant EC_X_3 = W2_SHIFT_EVAL_LOC;")
    print("")
    print("// Aliases for selectors (Elliptic curve gadget)")
    print("uint256 internal constant EC_Q_SIGN = QL_EVAL_LOC;")

def main():
    # This is an arbitrary offset, but will need to be adjusted based on the
    pointer = 0x1000

    # Print the verification key indicies
    print_header_centered("VK INDICIES")
    pointer = print_vk(pointer)

    # Print the proof with the given indicies
    print_header_centered("PROOF INDICIES")
    pointer = print_proof(pointer)

    print_header_centered("PROOF INDICIES - SUMCHECK UNIVARIATES")
    pointer = print_sumcheck_univariates(pointer)

    print_header_centered("PROOF INDICIES - SUMCHECK EVALUATIONS")
    pointer = print_entities(pointer)

    pointer = print_shplemini(pointer)

    print_header_centered("PROOF INDICIES - COMPLETE")

    print_header_centered("CHALLENGES")
    pointer = print_challenges(pointer)
    print_header_centered("CHALLENGES - COMPLETE")

    print_header_centered("SUMCHECK - RUNTIME MEMORY")

    print_header_centered("SUMCHECK - RUNTIME MEMORY - BARYCENTRIC")
    print_barycentric_domain()
    print_header_centered("SUMCHECK - RUNTIME MEMORY - BARYCENTRIC COMPLETE")

    print_header_centered("SUMCHECK - RUNTIME MEMORY - SUBRELATION EVALUATIONS")
    pointer = print_subrelation_eval(pointer)
    print_header_centered("SUMCHECK - RUNTIME MEMORY - SUBRELATION EVALUATIONS COMPLETE")

    print_header_centered("SUMCHECK - RUNTIME MEMORY - SUBRELATION INTERMEDIATES")
    pointer = print_subrelation_intermediates(pointer)

    print_header_centered("SUMCHECK - RUNTIME MEMORY - COMPLETE")

    print_header_centered("SHPLEMINI - RUNTIME MEMORY")
    print_header_centered("SHPLEMINI - POWERS OF EVALUATION CHALLENGE")
    pointer = print_powers_of_evaluation_challenge(pointer)
    print_header_centered("SHPLEMINI - POWERS OF EVALUATION CHALLENGE COMPLETE")

    # This is a temporary method to write where the batch scalars should be
    # But in reality it will overlap with the sumcheck univariates
    print_header_centered("SHPLEMINI - RUNTIME MEMORY - BATCH SCALARS")
    pointer = print_batch_scalars(pointer)
    print_header_centered("SHPLEMINI - RUNTIME MEMORY - BATCH SCALARS COMPLETE")

    print_header_centered("SHPLEMINI - RUNTIME MEMORY - INVERSIONS")
    print_inversions()
    print_header_centered("SHPLEMINI RUNTIME MEMORY - INVERSIONS - COMPLETE")
    print_header_centered("SHPLEMINI RUNTIME MEMORY - COMPLETE")

    print("")
    pointer = print_later_scratch_space(pointer)

    print_header_centered("Temporary space")
    pointer = print_temp_space(pointer)
    print_header_centered("Temporary space - COMPLETE")

    print_scratch_space_aliases()
    print_ec_aliases()


main()
