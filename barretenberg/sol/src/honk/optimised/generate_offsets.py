

## A mini python script to help generate the locations in memory of the indicies requred to generate a proof

vk_fr = [
    "vk_circuit_size",
    "vk_num_public_inputs",
    "vk_pub_inputs_offset",
]

vk_g1 = [
    "q_m",
    "q_c",
    "q_l",
    "q_r",
    "q_o",
    "q_4",
    "q_arith",
    "q_delta_range",
    "q_elliptic",
    "q_aux",
    "q_lookup",
    "sigma_1",
    "sigma_2",
    "sigma_3",
    "sigma_4",
    "id_1",
    "id_2",
    "id_3",
    "id_4",
    "table_1",
    "table_2",
    "table_3",
    "table_4",
    "lagrange_first",
    "lagrange_last"
]

proof_fr = [
    "proof_circuit_size",
    "proof_num_public_inputs",
    "proof_pub_inputs_offset",
]

proof_g1 = [
    "w_l",
    "w_r",
    "w_o",
    "w_4",
    "z_perm",
    "lookup_inverses",
    "lookup_read_counts",
    "lookup_read_tags"
]

entities = [
    "Q_M",
    "Q_C",
    "Q_L",
    "Q_R",
    "Q_O",
    "Q_4",
    "Q_ARITH",
    "Q_RANGE",
    "Q_ELLIPTIC",
    "Q_AUX",
    "Q_LOOKUP",
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
    "LAGRANGE_LAST",
    "W_L",
    "W_R",
    "W_O",
    "W_4",
    "Z_PERM",
    "LOOKUP_INVERSES",
    "LOOKUP_READ_COUNTS",
    "LOOKUP_READ_TAGS",
    "TABLE_1_SHIFT",
    "TABLE_2_SHIFT",
    "TABLE_3_SHIFT",
    "TABLE_4_SHIFT",
    "W_L_SHIFT",
    "W_R_SHIFT",
    "W_O_SHIFT",
    "W_4_SHIFT",
    "Z_PERM_SHIFT"
]

challenges = [
    "eta",
    "eta_two",
    "eta_three",
    "beta",
    "gamma",
    "rho",

    #zm
    "zm_x",
    "zm_y",
    "zm_Z",
    "zm_quotient",
    "public_inputs_delta"
]


# Generate the verification key memory locations, leaving plenty of room for scratch space

def print_loc(pointer: int, name: str):
    print("uint256 internal constant ", name, " = ", hex(pointer), ";")


def print_fr(pointer:int , name: str):
    print_loc(pointer, name)

def print_g1(pointer: int, name: str):
    print_loc(pointer, name + "_x0_loc")
    print_loc(pointer + 32, name + "_x1_loc")
    print_loc(pointer + 64, name + "_y0_loc")
    print_loc(pointer + 96, name + "_y1_loc")


def print_vk(pointer: int):
    for item in vk_fr:
        print_fr(pointer, item)
        pointer += 32

    for item in vk_g1:
        print_g1(pointer, item)
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

BATCHED_RELATION_PARTIAL_LENGTH = 7
PROOF_SIZE_LOG_N = 28
NUMBER_OF_ENTITIES = 42
NUMBER_OF_ALPHAS = 17
NUMBER_OF_SUBRELATIONS = 18
# For the meantime we will load the entire proof into memory here
# however i predict that it will be more efficient to load in the sumcheck univars
# for each round with their own slice of calldatacopy
def print_sumcheck_univariates(pointer: int):
    for relation_len in range(0, BATCHED_RELATION_PARTIAL_LENGTH):
        for size in range(0, PROOF_SIZE_LOG_N):
            name = "sumcheck_univariate_" + str(relation_len) + "_" + str(size)
            print_fr(pointer, name)
            pointer += 32

    return pointer

def print_entities(pointer: int):
    for entity in entities:
        print_fr(pointer, "eval_"+entity)
        pointer += 32

    return pointer


def print_zeromorph(pointer: int):
    for size in range(0, PROOF_SIZE_LOG_N):
        print_g1(pointer, "zm_cqs_" + str(size))
        pointer += (4*32)

    print_g1(pointer, "zm_cq")
    pointer += 32
    print_g1(pointer, "zm_pi")
    pointer += 32

    return pointer

def print_challenges(pointer: int):
    for chall in challenges:
        print_fr(pointer, chall + "_challenge")
        pointer += 32

    for alpha in range(0, NUMBER_OF_ALPHAS):
        print_fr(pointer, "alpha_challenge_" + str(alpha))
        pointer += 32
    
    # TODO: this NOT THE PROOF SIZE LOG_N?????
    for gate in range(0, PROOF_SIZE_LOG_N):
        print_fr(pointer, "gate_challenge_" + str(gate))
        pointer += 32

    for sum_u in range(0, PROOF_SIZE_LOG_N):
        print_fr(pointer, "sum_u_challenge_" + str(sum_u))
        pointer += 32

    return pointer


def main():
    # This is an arbitrary offset, but will need to be adjusted based on the 
    pointer = 0x380

    # Print the verification key indicies
    pointer = print_vk(pointer)

    # Print the proof with the given indicies
    pointer = print_proof(pointer)

    pointer = print_sumcheck_univariates(pointer)

    pointer = print_entities(pointer)

    pointer = print_zeromorph(pointer)

    pointer = print_challenges(pointer)


main()
