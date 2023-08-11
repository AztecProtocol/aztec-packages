from math import log2

def print_circuit_data(msg, circuit, native_msm):
    print(msg)
    print(f"  log_n:          {circuit.log_n}")
    if native_msm:
        msm_time = sum([msm.time_ultra_native() for msm in circuit.verifier_msms])
    else:
        msm_time = sum([msm.time_ultra_non_native()
                        for msm in circuit.verifier_msms])
    print(f"  max memory:     {circuit.max_memory} KiB")
    print(f"  time to verify: {msm_time} ms")
    proof_size = circuit.proof_size
    print(f"  proof_size:     {proof_size} B")

def log_circuit_data(lists, circuit, native_msm):
    if native_msm:
        msm_time = sum([msm.time_ultra_native() for msm in circuit.verifier_msms])
    else:
        msm_time = sum([msm.time_ultra_non_native()
                        for msm in circuit.verifier_msms])
    datum = [circuit.log_n, 
             round(circuit.max_memory / (1<<20), 1), # MiB 
             round(msm_time / 1000, 1),              # seconds
             round(circuit.proof_size / (1<<10), 1)  # KiB
             ]
    lists.append(datum)


def get_log_circuit_size(num_gates):
    return 1 + int(log2(num_gates))

def info(input):
    print(input)