import numpy as np

# np.set_printoptions(formatter={'int': hex})

class Row:
    def __init__(self, start):
        self.q_c = start + 2*0
        self.q_l = start + 2*1
        self.q_r = start + 2*2
        self.q_o = start + 2*3
        self.q_m = start + 2*4
        self.sigma_1 = start + 2*5
        self.sigma_2 = start + 2*6
        self.sigma_3 = start + 2*7
        self.id_1 = start + 2*8
        self.id_2 = start + 2*9
        self.id_3 = start + 2*10
        self.lagrange_first = start + 2*11
        self.lagrange_last = start + 2*12
        self.w_l = start + 2*13
        self.w_r = start + 2*14
        self.w_o = start + 2*15
        self.z_perm = start + 2*16
        self.z_perm_shift = start + 2*17

        self.entities = [self.q_c, self.q_l, self.q_r, self.q_o, self.q_m, self.sigma_1, self.sigma_2, self.sigma_3, self.id_1,
                         self.id_2, self.id_3, self.lagrange_first, self.lagrange_last, self.w_l, self.w_r, self.w_o, self.z_perm, self.z_perm_shift]


class Instance:
    def __init__(self, rows):
        self.num_entities = len(rows[0].entities)
        self.rows = rows


class Instances:
    def __init__(self, instances):
        self.num_entities = instances[0].num_entities
        self.data = instances


def rel(w_l, w_r, w_o, q_m, q_l, q_r, q_o, q_c):
    return q_m * w_l * w_r + q_l * w_l + q_r * w_r + q_o * w_o + q_c


def extend_one_entity(input):
    result = input
    delta = input[1]-input[0]
    for _ in range(2, 6):
        result.append(delta + result[-1])
    return result


def get_extended_univariates(instances, row_idx):
    rows = [instance.rows[row_idx] for instance in instances.data]
    for entity_idx in range(instances.num_entities):
        result = [row.entities[entity_idx] for row in rows]
        result = np.array(extend_one_entity(result))
        return result


if __name__ == "__main__":
    i0 = Instance([Row(0), Row(1)])
    i1 = Instance([Row(64), Row(65)])
    instances = Instances([i0, i1])

    row_0_extended = Row(get_extended_univariates(instances, 0))
    row_1_extended = Row(get_extended_univariates(instances, 1))

    accumulator = np.array([0, 0, 0, 0, 0, 0])
    zeta_pow = 1
    zeta = 2
    for row in [row_0_extended, row_1_extended]:
        relation_value = rel(row.w_l, row.w_r, row.w_o, row.q_m,
                             row.q_l, row.q_r, row.q_o, row.q_c)
        accumulator += zeta_pow * relation_value
        zeta_pow *= zeta

    accumulator *= extend_one_entity([1, 2])


    print(f"final accumulator value:\n {accumulator}")
