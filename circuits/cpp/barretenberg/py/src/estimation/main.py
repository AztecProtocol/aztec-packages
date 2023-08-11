from flavors import GoblinUltra
from circuit import CircuitKZG
from goblin import Goblin
from protogalaxy import FoldingVerifier, Decider

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

    def summary(self):
        self.goblin.summary()

    def log(self, recursion_list, eccvm_list, translator_list):
        self.goblin.log(recursion_list, eccvm_list, translator_list)

    def process_logs(self, recursion_list, eccvm_list, translator_list):
        self.goblin.process_logs(recursion_list, eccvm_list, translator_list)


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

    def summary(self):
        self.goblin.summary()

    def log(self, recursion_list, eccvm_list, translator_list):
        self.goblin.log(recursion_list, eccvm_list, translator_list)

    def process_logs(self, recursion_list, eccvm_list, translator_list):
        self.goblin.process_logs(recursion_list, eccvm_list, translator_list)


if __name__ == "__main__":
    print("STRAIGHT GOBLIN")
    recursion_list, eccvm_list, translator_list = [], [], []
    for log_k in range(1, 11):
        num_circuits = 1 << log_k
        client_stack = ClientStraightGoblin(num_circuits)
        client_stack.log(recursion_list, eccvm_list, translator_list)

    client_stack.process_logs(recursion_list, eccvm_list, translator_list)

    print("\n========================================\n")

    print("PROTOGALAXIED GOBLIN")
    recursion_list, eccvm_list, translator_list = [], [], []
    for log_k in range(1, 11):
        num_circuits = 1 << log_k
        client_stack = ClientProtogalaxiedGoblin(num_circuits)
        client_stack.log(recursion_list, eccvm_list, translator_list)

    client_stack.process_logs(recursion_list, eccvm_list, translator_list)
