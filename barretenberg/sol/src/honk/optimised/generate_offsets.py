

### A mini python script to help generate the locations in memory of the indicies requred to generate a proof

# Switch this flag if you want to generate zk verifier offsets
is_zk = True

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
    "PAIRING_POINT_0_X_0_LOC",
    "PAIRING_POINT_0_X_1_LOC",
    "PAIRING_POINT_0_Y_0_LOC",
    "PAIRING_POINT_0_Y_1_LOC",
    "PAIRING_POINT_1_X_0_LOC",
    "PAIRING_POINT_1_X_1_LOC",
    "PAIRING_POINT_1_Y_0_LOC",
    "PAIRING_POINT_1_Y_1_LOC",
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

# Proof additions when running the zero knowledge protocol
before_proof_g1_zk = [
    "GEMINI_MASKING_POLY"
]

# Proof additions when running the zero knowledge protocol
after_proof_g1_zk = [
    "LIBRA_CONCAT",
]

libra_commitments = [
    "LIBRA_GRAND_PRODUCT",
    "LIBRA_QUOTIENT"
]

# All evaluations supplied as part of sumcheck relation checks
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

# TODO: check what the names of these are in + where are they
libra_entitiy_evals = [
    "LIBRA_CONCATENATION",
    "LIBRA_SHIFTED_GRAND_SUM",
    "LIBRA_GRAND_SUM_EVAL",
    "LIBRA_QUOTIENT_EVAL"
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
    centered = "\n/*" + text.center(width) + "*/"
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
    print_loc(pointer + FIELD_ELEMENT_BYTES, name + "_Y_LOC")

def print_g1(pointer: int, name: str):
    print_loc(pointer, name + "_X0_LOC")
    print_loc(pointer + FIELD_ELEMENT_BYTES, name + "_X1_LOC")
    print_loc(pointer + FIELD_ELEMENT_BYTES * 2, name + "_Y0_LOC")
    print_loc(pointer + FIELD_ELEMENT_BYTES * 3, name + "_Y1_LOC")


def print_vk(pointer: int):
    for item in vk_g1:
        print_small_g1(pointer, item)
        pointer += GROUP_ELEMENT_BYTES

    return pointer

def print_proof(pointer: int):
    for item in pairing_points:
        print_fr(pointer, item)
        pointer += FIELD_ELEMENT_BYTES

    if is_zk:
        print_small_g1(pointer, "GEMINI_MASKING_POLY")
        pointer += GROUP_ELEMENT_BYTES

    for item in proof_g1:
        print_small_g1(pointer, item)
        pointer += GROUP_ELEMENT_BYTES

    if is_zk:
        for item in after_proof_g1_zk:
            print_small_g1(pointer, item)
            pointer += GROUP_ELEMENT_BYTES

        # LIBRA_SUM is an Fr element after LIBRA_CONCAT
        print_fr(pointer, "LIBRA_SUM_LOC")
        pointer += FIELD_ELEMENT_BYTES

    return pointer

BATCHED_RELATION_PARTIAL_LENGTH = 9 if is_zk else 8
PROOF_SIZE_LOG_N = 15
NUMBER_OF_ENTITIES = 42 if is_zk else 41
NUMBER_OF_SUBRELATIONS = 29
NUMBER_OF_ALPHAS = NUMBER_OF_SUBRELATIONS - 1

FIELD_ELEMENT_BYTES = 32
GROUP_ELEMENT_BYTES = 64

# For the meantime we will load the entire proof into memory here
# however i predict that it will be more efficient to load in the sumcheck univars
# for each round with their own slice of calldatacopy
def print_sumcheck_univariates(pointer: int):
    for round in range(0, PROOF_SIZE_LOG_N):
        for coeff in range(0, BATCHED_RELATION_PARTIAL_LENGTH):
            name = "SUMCHECK_UNIVARIATE_" + str(round) + "_" + str(coeff) + "_LOC"
            print_fr(pointer, name)
            pointer += FIELD_ELEMENT_BYTES

    return pointer

def print_entities(pointer: int):
    if is_zk:
        # GEMINI_MASKING_EVAL is entity index 0 in ZK mode
        print_fr(pointer, "GEMINI_MASKING_EVAL_LOC")
        pointer += FIELD_ELEMENT_BYTES

    for entity in entities:
        print_fr(pointer, entity + "_EVAL_LOC")
        pointer += FIELD_ELEMENT_BYTES

    return pointer


def print_shplemini(pointer: int):
    if is_zk:
        # LIBRA_EVALUATION is an Fr after entity evals
        print_fr(pointer, "LIBRA_EVALUATION_LOC")
        pointer += FIELD_ELEMENT_BYTES

        # LIBRA_GRAND_PRODUCT and LIBRA_QUOTIENT are G1 points
        for item in libra_commitments:
            print_small_g1(pointer, item)
            pointer += GROUP_ELEMENT_BYTES

    print_header_centered("PROOF INDICIES - GEMINI FOLDING COMMS")
    for size in range(0, PROOF_SIZE_LOG_N - 1):
        print_small_g1(pointer, "GEMINI_FOLD_UNIVARIATE_" + str(size))
        pointer += GROUP_ELEMENT_BYTES

    print_header_centered("PROOF INDICIES - GEMINI FOLDING EVALUATIONS")
    for size in range(0, PROOF_SIZE_LOG_N):
        print_fr(pointer, "GEMINI_A_EVAL_" + str(size))
        pointer += FIELD_ELEMENT_BYTES

    if is_zk:
        print_header_centered("PROOF INDICIES - LIBRA POLY EVALUATIONS")
        for i in range(0, 4):
            print_fr(pointer, "LIBRA_POLY_EVAL_" + str(i) + "_LOC")
            pointer += FIELD_ELEMENT_BYTES

    print_small_g1(pointer, "SHPLONK_Q")
    pointer += GROUP_ELEMENT_BYTES
    print_small_g1(pointer, "KZG_QUOTIENT")
    pointer += GROUP_ELEMENT_BYTES

    return pointer

def print_challenges(pointer: int):
    for chall in challenges:
        print_fr(pointer, chall + "_CHALLENGE")
        pointer += FIELD_ELEMENT_BYTES

    for alpha in range(0, NUMBER_OF_ALPHAS):
        print_fr(pointer, "ALPHA_CHALLENGE_" + str(alpha))
        pointer += FIELD_ELEMENT_BYTES

    # TODO: this NOT THE PROOF SIZE LOG_N?????
    for gate in range(0, PROOF_SIZE_LOG_N):
        print_fr(pointer, "GATE_CHALLENGE_" + str(gate))
        pointer += FIELD_ELEMENT_BYTES

    if is_zk:
        print_fr(pointer, "LIBRA_CHALLENGE")
        pointer += FIELD_ELEMENT_BYTES

    for sum_u in range(0, PROOF_SIZE_LOG_N):
        print_fr(pointer, "SUM_U_CHALLENGE_" + str(sum_u))
        pointer += FIELD_ELEMENT_BYTES

    return pointer

BARYCENTRIC_DOMAIN_SIZE = 9 if is_zk else 8
def print_barycentric_domain(pointer: int):
    for i in range(0, BARYCENTRIC_DOMAIN_SIZE):
        print_fr(pointer , "BARYCENTRIC_LAGRANGE_DENOMINATOR_" + str(i) + "_LOC")
        pointer += FIELD_ELEMENT_BYTES

    for i in range(0, PROOF_SIZE_LOG_N):
        for j in range(0, BARYCENTRIC_DOMAIN_SIZE):
            print_fr(pointer, "BARYCENTRIC_DENOMINATOR_INVERSES_" + str(i) + "_" + str(j) + "_LOC")
            pointer += FIELD_ELEMENT_BYTES

    return pointer


def print_subrelation_eval(pointer: int):
    for i in range(0, NUMBER_OF_SUBRELATIONS):
        print_fr(pointer, "SUBRELATION_EVAL_" + str(i) + "_LOC")
        pointer += FIELD_ELEMENT_BYTES

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
        pointer += FIELD_ELEMENT_BYTES

    for item in subrelation_intermediates:
        print_fr(pointer, item)
        pointer += FIELD_ELEMENT_BYTES

    return pointer

def print_batch_scalars(pointer: int):
    BATCH_SIZE = 69
    for i in range(1, BATCH_SIZE):
        print_fr(pointer, "BATCH_SCALAR_" + str(i) + "_LOC")
        pointer += FIELD_ELEMENT_BYTES

    return pointer

def print_POWERS_OF_EVALUATION_CHALLENGE(pointer: int):
    for i in range(0, PROOF_SIZE_LOG_N):
        print_fr(pointer, "POWERS_OF_EVALUATION_CHALLENGE_" + str(i) + "_LOC")
        pointer += FIELD_ELEMENT_BYTES
    return pointer

def print_batched_evaluation_accumulator_inversions(pointer: int):
    BATCH_SIZE = 15
    for i in range(0, BATCH_SIZE):
        print_fr(pointer, "BATCH_EVALUATION_ACCUMULATOR_INVERSION_" + str(i) + "_LOC")
        pointer += FIELD_ELEMENT_BYTES
    return pointer

def print_constant_term_accumulator_location(pointer: int):
    print_fr(pointer, "CONSTANT_TERM_ACCUMULATOR_LOC")
    pointer += FIELD_ELEMENT_BYTES
    return pointer

def print_gemini_r_inv(pointer: int):
    print_fr(pointer, "GEMINI_R_INV_LOC")
    pointer += FIELD_ELEMENT_BYTES
    return pointer

def print_libra_subgroup_denom(pointer: int):
    print_fr(pointer, "LIBRA_SUBGROUP_DENOM_LOC")
    pointer += FIELD_ELEMENT_BYTES
    return pointer

def print_inversions(pointer: int):
    pointer = print_batched_evaluation_accumulator_inversions(pointer)

    print("")
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

    return pointer



def print_pos_neg_inverted_denominators(pointer: int):
    print_fr(pointer, "POS_INVERTED_DENOMINATOR")
    pointer += FIELD_ELEMENT_BYTES
    print_fr(pointer, "NEG_INVERTED_DENOMINATOR")
    pointer += FIELD_ELEMENT_BYTES
    return pointer

def print_inverted_challenge_pow_minus_u(pointer: int):
    for i in range(0, PROOF_SIZE_LOG_N):
        print_fr(pointer, "INVERTED_CHALLENGE_POW_MINUS_U_" + str(i) + "_LOC")
        pointer += FIELD_ELEMENT_BYTES
    return pointer

def print_pos_inverted_denom(pointer: int):
    for i in range(0, PROOF_SIZE_LOG_N):
        print_fr(pointer, "POS_INVERTED_DENOM_" + str(i) + "_LOC")
        pointer += FIELD_ELEMENT_BYTES
    return pointer

def print_neg_inverted_denom(pointer: int):
    for i in range(0, PROOF_SIZE_LOG_N):
        print_fr(pointer, "NEG_INVERTED_DENOM_" + str(i) + "_LOC")
        pointer += FIELD_ELEMENT_BYTES
    return pointer

def print_fold_pos_evaluations(pointer: int):
    for i in range(0, PROOF_SIZE_LOG_N):
        print_fr(pointer, "FOLD_POS_EVALUATIONS_" + str(i) + "_LOC")
        pointer += FIELD_ELEMENT_BYTES
    return pointer

def print_barycentric_temp_mem(pointer: int):
    for i in range(0, PROOF_SIZE_LOG_N * BARYCENTRIC_DOMAIN_SIZE):
        print_fr(pointer, "BARYCENTRIC_TEMP_" + str(i) + "_LOC")
        pointer += FIELD_ELEMENT_BYTES

    print_fr(pointer, "PUBLIC_INPUTS_DENOM_TEMP_LOC")
    pointer += FIELD_ELEMENT_BYTES
    print_fr(pointer, "GEMINI_R_INV_TEMP_LOC")
    pointer += FIELD_ELEMENT_BYTES
    print_fr(pointer, "LIBRA_SUBGROUP_DENOM_TEMP_LOC")
    pointer += FIELD_ELEMENT_BYTES
    print_fr(pointer, "BATCH_PRODUCT_TEMP_LOC")
    pointer += FIELD_ELEMENT_BYTES

    return pointer

def print_small_group_ipa_mem(pointer: int):
    for i in range(0, 256):
        print_fr(pointer, "CHALLENGE_POLY_LAGRANGE_BASE_" + str(i))
        pointer += FIELD_ELEMENT_BYTES

    for i in range(0, 256):
        print_fr(pointer, "CONSISTENCY_DENOMINATORS_BASE_" + str(i))
        pointer += FIELD_ELEMENT_BYTES

    for i in range(0, 256):
        print_fr(pointer, "CONSISTENCY_PRODUCTS_BASE_" + str(i))
        pointer += FIELD_ELEMENT_BYTES

    return pointer

def print_later_scratch_space(pointer: int):
    print_fr(pointer, "LATER_SCRATCH_SPACE")
    pointer += FIELD_ELEMENT_BYTES
    return pointer

def print_temp_space(pointer: int):
    for i in range(0, 3 * PROOF_SIZE_LOG_N):
        print_fr(pointer, "TEMP_" + str(i) + "_LOC")
        pointer += FIELD_ELEMENT_BYTES
    return pointer

def print_scratch_space_aliases():
    print("")
    print("// Scratch space aliases at 0x00-0x40 are used in two temporal phases:")
    print("// Phase 1 (sumcheck rounds): CHALL_POW_LOC, SUMCHECK_U_LOC, GEMINI_A_LOC")
    print("// Phase 2 (shplemini batch scalars): SS_POS_INV_DENOM_LOC, SS_NEG_INV_DENOM_LOC, SS_GEMINI_EVALS_LOC")
    print("// These phases do not overlap in execution time.")
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
    pointer = print_barycentric_domain(pointer)
    print_header_centered("SUMCHECK - RUNTIME MEMORY - BARYCENTRIC COMPLETE")

    print_header_centered("SUMCHECK - RUNTIME MEMORY - SUBRELATION EVALUATIONS")
    pointer = print_subrelation_eval(pointer)
    print_header_centered("SUMCHECK - RUNTIME MEMORY - SUBRELATION EVALUATIONS COMPLETE")

    print_header_centered("SUMCHECK - RUNTIME MEMORY - SUBRELATION INTERMEDIATES")
    pointer = print_subrelation_intermediates(pointer)

    print_header_centered("SUMCHECK - RUNTIME MEMORY - COMPLETE")

    print_header_centered("SHPLEMINI - RUNTIME MEMORY")
    print_header_centered("SHPLEMINI - POWERS OF EVALUATION CHALLENGE")
    pointer = print_POWERS_OF_EVALUATION_CHALLENGE(pointer)
    print_header_centered("SHPLEMINI - POWERS OF EVALUATION CHALLENGE COMPLETE")

    # This is a temporary method to write where the batch scalars should be
    # But in reality it will overlap with the sumcheck univariates
    print_header_centered("SHPLEMINI - RUNTIME MEMORY - BATCH SCALARS")
    pointer = print_batch_scalars(pointer)
    print_header_centered("SHPLEMINI - RUNTIME MEMORY - BATCH SCALARS COMPLETE")

    print_header_centered("SHPLEMINI - RUNTIME MEMORY - INVERSIONS")
    pointer = print_gemini_r_inv(pointer)
    if is_zk:
        pointer = print_libra_subgroup_denom(pointer)

    pointer = print_inversions(pointer)
    print_header_centered("SHPLEMINI RUNTIME MEMORY - INVERSIONS - COMPLETE")
    print_header_centered("SHPLEMINI RUNTIME MEMORY - COMPLETE")

    print_header_centered("Temporary space - for batch inversions")

    pointer = print_barycentric_temp_mem(pointer)
    pointer = print_temp_space(pointer)
    print("")

    if is_zk:
        pointer = print_small_group_ipa_mem(pointer)

    pointer = print_later_scratch_space(pointer)
    print_header_centered("Temporary space - COMPLETE")

    print_scratch_space_aliases()
    print_ec_aliases()


main()
