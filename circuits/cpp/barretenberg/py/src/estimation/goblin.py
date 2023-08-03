from circuit import *
from flavors import *
from math import log2

class Goblin:
    def __init__(self, circuits):
        num_eccvm_gates = 0
        self.circuits = circuits
        for circuit in self.circuits:
            for msm in circuit.VerifierMSMs:
                num_eccvm_gates += msm.num_gates_eccvm()
        self.eccvm = CircuitIPA(ECCVM(), log_n=int(
            log2(num_eccvm_gates)) + 1, num_public_inputs=0)

        num_translator_gates = 0
        for circuit in self.circuits:
            for msm in circuit.VerifierMSMs:
                num_translator_gates += msm.num_gates_translator()
        self.translator = CircuitKZG(Translator(), log_n=int(
            log2(num_translator_gates)) + 1, num_public_inputs=0)

    def print_circuit_data(self, msg, circuit, native_msm):
        print(msg)
        print("  log_n:          " + str(circuit.log_n))
        if native_msm:
            msm_time = sum([msm.time_native() for msm in circuit.VerifierMSMs])
        else:
            msm_time = sum([msm.time_non_native()
                           for msm in circuit.VerifierMSMs])
        print("  time to verify: " + str(msm_time) + " ms")
        proof_size = circuit.proof_size
        print("  proof_size:     " + str(proof_size) + " B")

    def summary(self):
        self.print_circuit_data("Recursion Circuit: ",
                                self.circuits[-1], native_msm=False)
        self.print_circuit_data("ECCVM: ", self.eccvm, native_msm=True)
        self.print_circuit_data("Translator: ",
                                self.translator, native_msm=False)

        total_proof_size = self.circuits[-1].proof_size + \
            self.eccvm.proof_size + self.translator.proof_size
        print("Total proof size: " + str(total_proof_size) + " B")


if __name__ == "__main__":
    circuits = [CircuitKZG(Ultra(), log_n=13, num_public_inputs=0)
                for i in range(1, 5)]
    goblin = Goblin(circuits)
    total_proof_size = 0
    goblin.summary()
