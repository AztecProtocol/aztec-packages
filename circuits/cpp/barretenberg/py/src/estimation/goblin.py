from circuit import CircuitKZG, CircuitIPA
from flavors import GoblinUltra, ECCVM, Translator
from utils import *


class Goblin:
    def __init__(self, final_circuit, opqueue):
        num_eccvm_gates = 0
        num_translator_gates = 0
        for msm in opqueue:
            num_eccvm_gates += msm.num_gates_eccvm()
            num_translator_gates += msm.num_gates_translator()

        self.final_circuit = final_circuit
        self.eccvm = CircuitIPA(ECCVM(), 
                                log_n=get_log_circuit_size(num_eccvm_gates), 
                                num_public_inputs=0)
        self.translator = CircuitKZG(Translator(), 
                                     log_n=get_log_circuit_size(num_translator_gates), 
                                    num_public_inputs=0)

    def summary(self):
        print_circuit_data("Last Circuit: ",
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
        print(f"Total memory :    {total_memory_size} KiB")

