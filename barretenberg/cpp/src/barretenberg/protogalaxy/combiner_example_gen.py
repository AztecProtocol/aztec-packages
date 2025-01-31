# TODO(https://github.com/AztecProtocol/barretenberg/issues/760): Delete this?

# np.set_printoptions(formatter={'int': hex})

import numpy as np

EXTENDED_RELATION_LENGTH = 12

class Row:
    def __init__(self, base_poly):
        # List of all entities in the correct order
        self.entity_names = [
            'q_m', 'q_c', 'q_l', 'q_r', 'q_o', 'q_4', 'q_arith', 'q_delta_range', 'q_elliptic', 'q_aux',
            'q_lookup', 'q_busread', 'q_poseidon2_external_1', 'q_poseidon2_external_2',
            'sigma_1', 'sigma_2', 'sigma_3', 'sigma_4',
            'id_1', 'id_2', 'id_3', 'id_4',
            'table_1', 'table_2', 'table_3', 'table_4',
            'lagrange_first', 'lagrange_last', 'lagrange_ecc_op', 'databus_id',
            'w_l', 'w_r', 'w_o', 'w_4', 'z_perm',
            'lookup_inverses', 'lookup_read_counts', 'lookup_read_tags',
            'ecc_op_wire_1', 'ecc_op_wire_2', 'ecc_op_wire_3', 'ecc_op_wire_4',
            'calldata', 'calldata_read_counts', 'calldata_read_tags', 'calldata_inverses',
            'secondary_calldata', 'secondary_calldata_read_counts', 'secondary_calldata_read_tags',
            'secondary_calldata_inverses', 'return_data', 'return_data_read_counts',
            'return_data_read_tags', 'return_data_inverses',
            'w_l_shift', 'w_r_shift', 'w_o_shift', 'w_4_shift', 'z_perm_shift'
        ]

        # Initialize each entity
        for i, name in enumerate(self.entity_names):
            setattr(self, name, np.int64(base_poly + 2 * i))  # Convert result to avoid round ups
            print(f"{name}: {getattr(self, name)}")

    def arith_relation(self):
        return (self.q_m * self.w_l * self.w_r +
                self.q_l * self.w_l +
                self.q_r * self.w_r +
                self.q_o * self.w_o +
                self.q_c)


def extend_one_entity(input):
    result = list(input)  # Start with the input as a list
    delta = input[1] - input[0]
    for _ in range(2, EXTENDED_RELATION_LENGTH):
        result.append(delta + result[-1])
    return result

def compute_first_example():
    # Construct baseline extensions for the two rows; extentions for all polys will be computed via the Row constructor
    baseline_extension_0 = np.array(extend_one_entity([0, 200]))
    baseline_extension_1 = baseline_extension_0 + 1

    # Construct extensions for all polys for the two rows in consideration
    row_0_extended = Row(baseline_extension_0)
    row_1_extended = Row(baseline_extension_1)

    accumulator = np.zeros(EXTENDED_RELATION_LENGTH, dtype=np.int64)  # Use np.int64 for the accumulator
    zeta_pow = 1
    zeta = 2
    for row in [row_0_extended, row_1_extended]:
        accumulator += zeta_pow * row.arith_relation()
        zeta_pow *= zeta
    return accumulator


def compute_second_example():
    def arith_relation(w_l, w_r, w_o, q_m, q_l, q_r, q_o, q_c):
        return q_m * w_l * w_r + q_l * w_l + q_r * w_r + q_o * w_o + q_c

    result = 0
    #                0   1   2   3   4   5   6   7   8   9  10  11  12
    w_l = np.array([ 1,  3,  5,  7,  9, 11, 13, 15, 17, 19, 21, 23, 25])
    w_r = np.array([ 2,  4,  6,  8, 10, 12, 14, 16, 18, 20, 22, 24, 26])
    w_o = np.array([ 3,  7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47, 51])
    q_m = np.array([ 0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0])
    q_l = np.array([ 1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1])
    q_r = np.array([ 1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1])
    q_o = np.array([-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1])
    q_c = np.array([ 0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0])
    # contribution is zero, but why not?
    result += arith_relation(w_l, w_r, w_o, q_m, q_l, q_r, q_o, q_c)

    w_l = np.array([ 0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12])
    w_r = np.array([ 4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4])
    w_o = np.array([ 4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4,  4])
    q_m = np.array([ 0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12])
    q_l = np.array([ 1,  0, -1, -2, -3, -4, -5, -6, -7, -8, -9,-10,-11])
    q_r = np.array([ 1,  0, -1, -2, -3, -4, -5, -6, -7, -8, -9,-10,-11])
    q_o = np.array([-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1])
    q_c = np.array([ 0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0])

    result += arith_relation(w_l, w_r, w_o, q_m, q_l, q_r, q_o, q_c)
    result *= 2

    return result

if __name__ == "__main__":
    print(f"First example: \n  {compute_first_example()}")
    print(f"Second example:\n  {compute_second_example()}")

