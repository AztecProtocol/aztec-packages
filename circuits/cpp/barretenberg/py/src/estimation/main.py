from flavors import Ultra
from circuit import CircuitKZG
from goblin import Goblin
from protogalaxy import FoldingVerifier, Decider


class ClientStraightGoblin:
    # create circuits to fold
    def __init__(self, num_circuits):
        self.num_circuits = num_circuits
        circuits = [CircuitKZG(Ultra(), log_n=13, num_public_inputs=0)
                    for _ in range(num_circuits)]
        opqueue = []
        for circuit in circuits[1:]:
            opqueue += circuit.verifier_msms
    
        self.goblin = Goblin(circuits[-1], opqueue)

    def summary(self):
        self.goblin.summary()


class ClientProtogalaxiedGoblin:
    # create circuits to fold
    def __init__(self, num_circuits):
        self.num_circuits = num_circuits
        circuits = [CircuitKZG(Ultra(), log_n=13, num_public_inputs=0)
                    for _ in range(num_circuits)]
        self.folding_verifier = FoldingVerifier(circuits)
        self.decider = Decider(self.folding_verifier)

        opqueue = []
        opqueue += self.folding_verifier.msms
        opqueue += self.decider.verifier_msms
        self.goblin = Goblin(self.decider, opqueue)

    def summary(self):
        # self.folding_verifier.summary()
        self.goblin.summary()


if __name__ == "__main__":
    num_circuits = 2
    for _ in range(10):
        print("===========================")
        print(f"num circuits: {num_circuits}")
        print("STRAIGHT GOBLIN")
        client_stack = ClientStraightGoblin(num_circuits)
        client_stack.summary()
        print("---------------------------")

        print("PROTOGALAXIED GOBLIN")
        client_stack = ClientProtogalaxiedGoblin(num_circuits)

        client_stack.summary()
        print("===========================\n")

        num_circuits *= 2
