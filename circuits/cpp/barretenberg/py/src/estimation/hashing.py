# not in use yet

class Oracle:
    # estimate derived by looking at UltraPlonk 
    # recursive verification of UltraPlonk proofs.
    def num_gates_to_hash(self, num_bytes):
        return 7 * num_bytes
    def time_to_hash(self, num_bytes):
        return 1 + int(0.075 * num_bytes) # ms
