from circuit import CircuitKZG, CircuitIPA
from flavors import Ultra, ECCVM, Translator
from utils import info, get_circuit_size, print_circuit_data


class Goblin:
    def __init__(self, final_circuit, opqueue):
        num_eccvm_gates = 0
        num_translator_gates = 0
        for msm in opqueue:
            num_eccvm_gates += msm.num_gates_eccvm()
            num_translator_gates += msm.num_gates_translator()

        self.final_circuit = final_circuit
        self.eccvm = CircuitIPA(ECCVM(), log_n=get_circuit_size(
            num_eccvm_gates), num_public_inputs=0)
        self.translator = CircuitKZG(Translator(), log_n=get_circuit_size(
            num_translator_gates), num_public_inputs=0)

    def summary(self):
        print_circuit_data("Recursion Circuit: ",
                           self.final_circuit, native_msm=False)
        print_circuit_data("ECCVM: ", self.eccvm, native_msm=True)
        print_circuit_data("Translator: ",
                           self.translator, native_msm=False)

        total_proof_size = self.final_circuit.proof_size + \
            self.eccvm.proof_size + self.translator.proof_size

        total_memory_size = self.final_circuit.max_memory + \
            self.eccvm.max_memory + self.translator.max_memory

        print("\n")
        print(f"Total proof size: {total_proof_size} B")
        print(f"Total memory :    {total_memory_size} MiB")


if __name__ == "__main__":
    circuits_to_verify = [CircuitKZG(Ultra(), log_n=13, num_public_inputs=0)
                          for _ in range(1, 15)]
    opqueue = []
    for circuit in circuits_to_verify[:-1]:
        opqueue += circuit.verifier_msms
    goblin = Goblin(circuits_to_verify[-1], opqueue)
    goblin.summary()
