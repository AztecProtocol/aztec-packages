

## A mini python script to help generate the locations in memory of the indicies requred to generate a proof

vk_fr = [
    "VK_CIRCUIT_SIZE",
    "VK_NUM_PUBLIC_INPUTS",
    "VK_PUB_INPUTS_OFFSET",
]

vk_g1 = [
    "Q_M",
    "Q_C",
    "Q_L",
    "Q_R",
    "Q_O",
    "Q_4",
    "Q_ARITH",
    "Q_DELTA_RANGE",
    "Q_ELLIPTIC",
    "Q_AUX",
    "Q_LOOKUP",
    "Q_POSEIDON_2_EXTERNAL",
    "Q_POSEIDON_2_INERNAL",
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
    "QARITH",
    "QRANGE",
    "QELLIPTIC",
    "QAUX",
    "QLOOKUP",
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
    "TABLE1_SHIFT",
    "TABLE2_SHIFT",
    "TABLE3_SHIFT",
    "TABLE4_SHIFT",
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
    for item in proof_fr:
        print_fr(pointer, item)
        pointer += 32

    for item in proof_g1:
        print_g1(pointer, item)
        pointer += (4*32)

    return pointer

BATCHED_RELATION_PARTIAL_LENGTH = 8
PROOF_SIZE_LOG_N = 28
NUMBER_OF_ENTITIES = 44
NUMBER_OF_ALPHAS = 25
NUMBER_OF_SUBRELATIONS = 26 # should this not be the same?
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
    for size in range(0, PROOF_SIZE_LOG_N - 1):
        print_g1(pointer, "GEMINI_FOLD_UNIVARIATE_" + str(size))
        pointer += (4*32)

    for size in range(0, PROOF_SIZE_LOG_N):
        print_fr(pointer, "GEMINI_A_EVAL_" + str(size))
        pointer += 32

    print_g1(pointer, "SHPLONK_Q")
    pointer += 32
    print_g1(pointer, "KZG_QUOTIENT")
    pointer += 32

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
def print_barycentric_domain(pointer: int):
    for i in range(0, BARYCENTRIC_DOMAIN_SIZE):
        print_fr(pointer, "BARYCENTRIC_LAGRANGE_DENOMINATOR_" + str(i) + "_LOC")
        pointer += 32

    for i in range(0, BARYCENTRIC_DOMAIN_SIZE):
        print_fr(pointer, "BARYCENTRIC_DOMAIN_" + str(i) + "_LOC")
        pointer += 32

    for i in range(0, BARYCENTRIC_DOMAIN_SIZE):
        print_fr(pointer, "BARYCENTRIC_DENOMINATOR_INVERSES_" + str(i) + "_LOC")
        pointer += 32

    return pointer

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
    BATCH_SIZE = 74
    for i in range(0, BATCH_SIZE):
        print_fr(pointer, "BATCH_SCALAR_" + str(i) + "_LOC")
        pointer += 32

    return pointer


def main():
    # This is an arbitrary offset, but will need to be adjusted based on the
    pointer = 0x380

    # Print the verification key indicies
    print("// Verification key indicies")
    pointer = print_vk(pointer)

    print("")
    print("// Proof indicies")

    # Print the proof with the given indicies
    pointer = print_proof(pointer)

    print("")
    print("// Sumcheck univariates")
    pointer = print_sumcheck_univariates(pointer)

    print("")
    print("// Entities")
    pointer = print_entities(pointer)

    print("")
    print("// Shplemini")
    pointer = print_shplemini(pointer)

    print("")
    print("// Challenges")
    pointer = print_challenges(pointer)

    print("")
    print("// Barycentric domain")
    pointer = print_barycentric_domain(pointer)

    print("")
    print("// Subrelation evaluations")
    pointer = print_subrelation_eval(pointer)

    print("")
    print("// Subrelation intermediates")
    pointer = print_subrelation_intermediates(pointer)

    # This is a temporary method to write where the batch scalars should be
    # But in reality it will overlap with the sumcheck univariates
    pointer = 0x6420
    pointer = print_batch_scalars(pointer)


main()
