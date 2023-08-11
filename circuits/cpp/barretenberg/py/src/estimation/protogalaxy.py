from circuit import CircuitKZG
from flavors import GoblinUltra
from goblin import Goblin
from msm import MSM
from utils import *


class FoldingVerifier(CircuitKZG):
    # k instances folded into 1
    def __init__(self, circuits):
        flavor = GoblinUltra()
        self.log_n_in_stack = circuits[0].log_n
        num_instances_to_fold = len(circuits)  # k
        num_msms = flavor.NUM_POLYNOMIALS
        # don't need to fold shifts?
        num_msms -= flavor.NUM_SHIFTED_POLYNOMIALS
        # our constants include NUM_WITNESSES-many id polynomials
        num_msms -= flavor.NUM_WITNESSES
        # our constants include 2 Lagrange polynoma
        num_msms -= 2
        self.msms = [MSM(num_instances_to_fold) for _ in range(num_msms)]
        # rough estimate for number of non-MSM gates
        constant_overhead = 500 + 5 * self.log_n_in_stack
        # TODO: eccvm size used as a placeholder. Actual size?
        log_n = get_log_circuit_size(constant_overhead + sum([msm.num_gates_eccvm()
                                                              for msm in self.msms]))
        super(FoldingVerifier, self).__init__(
            flavor, log_n, num_public_inputs=0)
        assert (type(self.flavor) == GoblinUltra)

    def summary(self):
        print_circuit_data("FoldingVerifier: ", self, native_msm=False)


class Decider(CircuitKZG):
    # Estimating that the folding verifier has 23 scalar muls of length h between 2 and 1024
    # The folding verifier puts down about 2h gates for each 1.
    # 23 * 2 h between 92 and
    def log_gates_to_verify(log_n):
        return

    def __init__(self, folding_verifier):
        super(Decider, self).__init__(GoblinUltra(),
                                      folding_verifier.log_n_in_stack,
                                      num_public_inputs=0)

    def summary(self):
        print_circuit_data("FoldingDecider: ", self, native_msm=False)
