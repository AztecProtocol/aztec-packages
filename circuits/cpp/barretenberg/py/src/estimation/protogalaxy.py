from circuit import CircuitKZG
from flavors import Ultra
from goblin import Goblin
from msm import MSM
from utils import *


class FoldingVerifier(CircuitKZG):
    # k instances folded into 1
    def __init__(self, circuits):
        flavor = Ultra()
        num_instances_to_fold = len(circuits) # k
        num_msms = flavor.NUM_POLYNOMIALS
        # don't need to fold shifts?
        num_msms -= flavor.NUM_SHIFTED_POLYNOMIALS
        # our constants include NUM_WITNESSES-many id polynomials
        num_msms -= flavor.NUM_WITNESSES
        # our constants include 2 Lagrange polynoma
        num_msms -= 2
        self.msms = [MSM(num_instances_to_fold) for _ in range(num_msms)]
        log_n = get_circuit_size(sum([msm.num_gates_non_native()
                                      for msm in self.msms]))
        super(FoldingVerifier, self).__init__(
            flavor, log_n, num_public_inputs=0)
        assert (type(self.flavor) == Ultra)

    def summary(self):
        print_circuit_data("FoldingVerifier: ", self, native_msm=False)


class Decider(CircuitKZG):
    # k instances folded into 1
    def __init__(self, folding_verifier):
        super(Decider, self).__init__(
            Ultra(), get_circuit_size(folding_verifier.num_gates_non_native()), num_public_inputs=0)


if __name__ == "__main__":
    num_circuits = 2
    circuits = [CircuitKZG(Ultra(), log_n=12, num_public_inputs=0)
                for _ in range(num_circuits)]
    folding_verifier = FoldingVerifier(circuits)
    print(folding_verifier.log_n)
    decider = Decider(folding_verifier)

    goblin = Goblin([folding_verifier, decider])
    goblin.summary()
