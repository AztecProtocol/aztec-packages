from flavors import GoblinUltra
from circuit import CircuitKZG
from goblin import Goblin
from protogalaxy import FoldingVerifier, Decider
from utils import DataLog

# App circuits an kernel circuits are in a "stack" and all
# are assumed to have a fixed size
LOG_N_IN_STACK = 13


class ClientStraightGoblin:
    # create circuits to fold
    def __init__(self, num_circuits):
        self.num_circuits = num_circuits
        circuits = [CircuitKZG(GoblinUltra(), log_n=LOG_N_IN_STACK, num_public_inputs=0)
                    for _ in range(num_circuits)]
        opqueue = []
        for circuit in circuits[1:]:
            opqueue += circuit.verifier_msms

        self.goblin = Goblin(circuits[-1], opqueue)


class ClientProtogalaxiedGoblin:
    # create circuits to fold
    def __init__(self, num_circuits):
        self.num_circuits = num_circuits
        circuits = [CircuitKZG(GoblinUltra(), log_n=LOG_N_IN_STACK, num_public_inputs=0)
                    for _ in range(num_circuits)]
        self.folding_verifier = FoldingVerifier(circuits)
        self.decider = Decider(self.folding_verifier)

        opqueue = []
        opqueue += self.folding_verifier.msms
        opqueue += self.folding_verifier.verifier_msms
        self.goblin = Goblin(self.decider, opqueue)


if __name__ == "__main__":
    print("STRAIGHT GOBLIN")
    data_log = DataLog()
    for log_k in range(1, 11):
        num_circuits = 1 << log_k
        client_stack = ClientStraightGoblin(num_circuits)
        data_log.add_entries(client_stack.goblin.final_circuit,
                             client_stack.goblin.eccvm, 
                             client_stack.goblin.translator)
    data_log.print()

    print("\n========================================\n")

    print("PROTOGALAXIED GOBLIN")
    data_log = DataLog()
    for log_k in range(1, 11):
        num_circuits = 1 << log_k
        client_stack = ClientProtogalaxiedGoblin(num_circuits)
        data_log.add_entries(client_stack.goblin.final_circuit,
                             client_stack.goblin.eccvm, 
                             client_stack.goblin.translator)

    data_log.print()
