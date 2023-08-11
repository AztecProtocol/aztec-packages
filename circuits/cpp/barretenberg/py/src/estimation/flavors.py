FIELD_ELEMENT_SIZE = 32
COMMITMENT_SIZE = 2 * FIELD_ELEMENT_SIZE


class Flavor:
    def __init__(self, NUM_WITNESSES, NUM_POLYNOMIALS):
        self.NUM_WITNESSES = NUM_WITNESSES
        self.NUM_POLYNOMIALS = NUM_POLYNOMIALS
        self.base_proof_size = 0
        # circuit size
        self.base_proof_size += 4
        # num public inputs
        self.base_proof_size += 4
        # witness commitments
        self.base_proof_size += COMMITMENT_SIZE * self.NUM_WITNESSES
        # polynomial evaluations
        self.base_proof_size += FIELD_ELEMENT_SIZE * self.NUM_POLYNOMIALS


class GoblinUltra(Flavor):
    def __init__(self):
        self.MAX_RELATION_LENGTH = 6
        self.NUM_POLYNOMIALS = 48
        self.NUM_SHIFTED_POLYNOMIALS = 11
        # 4 wires, 2 grand product commitments, 1 sorted accumulator
        self.NUM_WITNESSES = 4
        super(GoblinUltra, self).__init__(self.NUM_WITNESSES, self.NUM_POLYNOMIALS)


class ECCVM(Flavor):
    def __init__(self):
        self.MAX_RELATION_LENGTH = 19
        self.NUM_POLYNOMIALS = 105
        self.NUM_SHIFTED_POLYNOMIALS = 26
        self.NUM_WITNESSES = 76
        super(ECCVM, self).__init__(self.NUM_WITNESSES, self.NUM_POLYNOMIALS)


class Translator(Flavor):
    def __init__(self):
        self.MAX_RELATION_LENGTH = 4
        self.NUM_POLYNOMIALS = 80
        self.NUM_SHIFTED_POLYNOMIALS = 80
        self.NUM_WITNESSES = 85
        super(Translator, self).__init__(
            self.NUM_WITNESSES, self.NUM_POLYNOMIALS)
