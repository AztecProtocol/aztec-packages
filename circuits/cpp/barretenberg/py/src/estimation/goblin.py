from circuit import CircuitKZG, CircuitIPA
from flavors import GoblinUltra, ECCVM, Translator
from utils import *
import numpy as np
import pandas as pd


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

    # TODO: this is clunky, should make a logging class.
    def log(self, recursion_list, eccvm_list, translator_list):
        log_circuit_data(recursion_list, self.final_circuit, native_msm=False)
        log_circuit_data(eccvm_list, self.eccvm, native_msm=True)
        log_circuit_data(translator_list, self.translator, native_msm=False)

    def process_logs(self, recursion_list, eccvm_list, translator_list):
        NUM_FEATURES = 4
        NUM_PROOF_TYPES = 3  # final Goblin recursion proof, eccvm, translator
        num_log_points = len(eccvm_list) # the number of times we log values
        assert (len(recursion_list) == num_log_points)
        assert (len(translator_list) == num_log_points)
        arr = np.array([recursion_list, eccvm_list, translator_list])
        # reshape so there are three rows, one for each of: final stack circuit; eccvm; translator
        arr = arr.reshape(3, NUM_FEATURES * num_log_points)
        # split every 4 columns (4 being the number of features)
        arr = np.array(np.hsplit(arr, num_log_points))
        # arrange into one row for each log point
        arr = arr.reshape(num_log_points, NUM_FEATURES*NUM_PROOF_TYPES)
        # transpose for compact representation
        arr = arr.transpose()

        # make a data frame for ease of visualization
        df = pd.DataFrame(arr)
        proof_types = ["Last circuit", "ECCVM", "Translator"]
        attribute_strings = ["log(circuit size)", 
                             "max memory        (MiB)", 
                             "verification time (s)", 
                             "proof_size        (KiB)"]
        index = pd.MultiIndex.from_product([proof_types, attribute_strings])
        df.index = index
        df.columns = [1<<(1+i) for i in range(num_log_points)] # TODO: these should be supplied at log time
        df.columns.names = ["num circuits in stack"]
        print(df)
