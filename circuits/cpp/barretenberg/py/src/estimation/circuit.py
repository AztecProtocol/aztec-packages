from flavors import *
from utils import info, DataLog
from msm import MSM


class CircuitNoPCS:
    """
    @brief A circuit whose recursive verification cost is of interest to us.
    The class will later be completed with a PCS through inheritance.

    @param flavor: The flavor of Honk in which we're doing recursion.
    @param log_n: The log of the smallest power of 2 greater than the circuit size.
    @num_pub_inputs: The number of public inputs to the circuit.
    """

    def __init__(self, flavor, log_n, num_pub_inputs):
        self.flavor = flavor
        self.log_n = log_n
        self.num_public_inputs = num_pub_inputs

        # Each polynomial consists of n 32-byte field elements. After the first
        # round of sumcheck, we also have a partial evaluation oach polynomials,
        # which consists of n/2 32-byte field elements
        self.max_memory = int(flavor.NUM_POLYNOMIALS *
                              (1 << log_n) * 32 * 1.5)  # bytes

        self.verifier_msms = [MSM(flavor.NUM_POLYNOMIALS),
                              MSM(flavor.NUM_SHIFTED_POLYNOMIALS),
                              MSM(2),
                              MSM(2),
                              MSM(1 + log_n)]

        self.proof_size = flavor.base_proof_size
        # Public inputs
        self.proof_size += FIELD_ELEMENT_SIZE * num_pub_inputs
        # Sumcheck: univariates
        self.proof_size += FIELD_ELEMENT_SIZE * flavor.MAX_RELATION_LENGTH * log_n
        # Gemini: commitments to Folds.
        self.proof_size += COMMITMENT_SIZE * (log_n - 1)
        # Gemini: commitments to partially-evaluated Folds
        self.proof_size += COMMITMENT_SIZE * 2
        # Gemini: evaluations of partially-evaluated Folds
        self.proof_size += FIELD_ELEMENT_SIZE * (log_n + 1)
        # Shplonk
        self.proof_size += COMMITMENT_SIZE

    def num_gates_non_native(self):
        return sum([msm.num_gates_non_native() for msm in self.verifier_msms])

    def num_gates_eccvm(self):
        return sum([msm.num_gates_eccvm() for msm in self.verifier_msms])

    def num_gates_translator(self):
        return sum([msm.num_gates_translator() for msm in self.verifier_msms])


class CircuitKZG(CircuitNoPCS):
    def __init__(self, flavor, log_n, num_public_inputs):
        super(CircuitKZG, self).__init__(flavor, log_n, num_public_inputs)
        self.verifier_msms += [MSM(1)]
        self.proof_size += COMMITMENT_SIZE


class CircuitIPA(CircuitNoPCS):
    def __init__(self, flavor, log_n, num_public_inputs):
        super(CircuitIPA, self).__init__(flavor, log_n, num_public_inputs)
        self.verifier_msms += [MSM(2 * self.log_n), MSM(1 << self.log_n)]

        # IPA: L and R commitments
        self.proof_size += 2 * COMMITMENT_SIZE * self.log_n
        # IPAL a_0 commitment
        self.proof_size += FIELD_ELEMENT_SIZE
