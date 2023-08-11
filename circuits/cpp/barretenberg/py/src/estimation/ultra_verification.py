def time_to_prove_ultra(log_gates):
    # Thus number is computed by averaging the s/gate values
    # that appear in the Ultra Honk benchmark suite.
    ms_per_gate = 0.00792871
    gates = 1<<log_gates
    return round(gates * ms_per_gate, 3)

def time_to_construct_msm_witnesses_over_BN254(circuit):
    if circuit.flavor.over_BN254:
        msm_time = sum([msm.time_ultra_non_native()
                        for msm in circuit.verifier_msms])
    else: # over Grumpkin
        msm_time = sum([msm.time_ultra_native()
                       for msm in circuit.verifier_msms])
    
    return msm_time


if __name__=="__main__":
    print(f"Verification tiem ")