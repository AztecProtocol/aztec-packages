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
        self.goblin = Goblin(circuits)

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
        self.goblin = Goblin([self.folding_verifier, self.decider])

    def summary(self):
        # self.folding_verifier.summary()
        self.goblin.summary()


if __name__ == "__main__":
    num_circuits = 2
    for _ in range(10):
        print("num circuits: " + str(num_circuits))
        print("STRAIGHT GOBLIN")
        client_stack = ClientStraightGoblin(num_circuits)
        client_stack.summary()
        print("---------------------")

        print("PROTOGALAXIED GOBLIN")
        client_stack = ClientProtogalaxiedGoblin(num_circuits)

        client_stack.summary()
        print("=====================")

        num_circuits *= 2
