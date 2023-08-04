from circuit import CircuitKZG, CircuitIPA
from flavors import Ultra, ECCVM, Translator
from utils import info, get_circuit_size, print_circuit_data


class Goblin:
    def __init__(self, circuits):
        num_eccvm_gates = 0
        self.circuits = circuits
        for circuit in self.circuits:
            for msm in circuit.VerifierMSMs:
                num_eccvm_gates += msm.num_gates_eccvm()
        self.eccvm = CircuitIPA(ECCVM(), log_n=get_circuit_size(
            num_eccvm_gates), num_public_inputs=0)

        num_translator_gates = 0
        for circuit in self.circuits:
            for msm in circuit.VerifierMSMs:
                num_translator_gates += msm.num_gates_translator()
        self.translator = CircuitKZG(Translator(), log_n=get_circuit_size(
            num_translator_gates), num_public_inputs=0)

    def summary(self):
        print_circuit_data("Recursion Circuit: ",
                           self.circuits[-1], native_msm=False)
        print_circuit_data("ECCVM: ", self.eccvm, native_msm=True)
        print_circuit_data("Translator: ",
                           self.translator, native_msm=False)

        total_proof_size = self.circuits[-1].proof_size + \
            self.eccvm.proof_size + self.translator.proof_size
        print("Total proof size: " + str(total_proof_size) + " B")


if __name__ == "__main__":
    circuits = [CircuitKZG(Ultra(), log_n=13, num_public_inputs=0)
                for _ in range(1, 5)]
    goblin = Goblin(circuits)
    goblin.summary()
