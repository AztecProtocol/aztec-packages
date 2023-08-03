from flavors import Ultra
from circuit import CircuitKZG
from goblin import Goblin
from protogalaxy import FoldingVerifier, Decider

class ClientStraightGoblin:
    # create circuits to fold
    def __init__(self):
        num_circuits = 16
        circuits = [CircuitKZG(Ultra(), log_n=13, num_public_inputs=0)]
        self.goblin = Goblin(circuits)
    
    def summary(self):
        self.goblin.summary()


class ClientProtostarifiedGoblin:
    # create circuits to fold
    def __init__(self):
        num_circuits = 16
        circuits = [CircuitKZG(Ultra(), log_n=13, num_public_inputs=0)]
        self.folding_verifier = FoldingVerifier(circuits)
        self.decider = Decider(self.folding_verifier)
        self.goblin = Goblin([self.folding_verifier, self.decider])
    
    def summary(self):
        self.goblin.summary()

if __name__ == "__main__":
    print("STRAIGHT GOBLIN")
    client_stack = ClientStraightGoblin()
    client_stack.summary()
    print("=====================")

    print("PROTOSTARIFIED GOBLIN")
    client_stack = ClientProtostarifiedGoblin()
    client_stack.summary()
    print("=====================")

