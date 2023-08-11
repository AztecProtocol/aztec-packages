class MSM:
    def __init__(self, length):
        self.length = length

    def num_gates_native(self):
        return 960 * self.length

    def num_gates_non_native(self):
        return 22000 + 4000 * self.length

    def num_gates_eccvm(self):
        return 3 + 2 * self.length

    def num_gates_translator(self):
        return 300 + 2 * self.length

    def time_ultra_native(self):
        return 1 * self.length

    def time_ultra_non_native(self):
        return 286 + 43 * self.length
