import json
from pathlib import Path

PREFIX = Path("build-op-count-time")
IVC_BENCH_JSON = Path("client_ivc_bench.json")
BENCHMARK = "ClientIVCBench/Full/6"


ops = {}
to_keep = [
    "construct_mock_function_circuit(t)",
    "construct_mock_folding_kernel(t)",
    "UltraComposer::create_prover_instance(t)",
    "ProtogalaxyProver::fold_instances(t)",
    "Decider::construct_proof(t)",
    "ECCVMComposer::create_prover(t)",
    "GoblinTranslatorComposer::create_prover(t)",
    "ECCVMProver::construct_proof(t)",
    "GoblinTranslatorProver::construct_proof(t)",
    "Goblin::merge(t)"
]

to_keep_condition = lambda x: x[0] in to_keep

with open(PREFIX/IVC_BENCH_JSON, "r") as read_file:
    read_result = json.load(read_file)
    for _bench in read_result["benchmarks"]:
        if _bench["name"] == BENCHMARK:
            bench = _bench

bench_components = dict([pair for pair in filter(to_keep_condition, bench.items()) ])
sum_of_kept_times_ms = sum(float(time) for _, time in bench_components.items())/1e6
total_time_ms = bench["real_time"]

MAX_LABEL_LENGTH = max(len(label) for label in to_keep)
column = {"label":"label", "ms":"ms", "%":"% total"}
print(f"{column['label']:<{MAX_LABEL_LENGTH}}{column['ms']:>8}  {column['%']:>8}")
for key in to_keep:
    time_ms = bench[key]/1e6
    print(f"{key:<{MAX_LABEL_LENGTH}}{time_ms:>8.0f}  {time_ms/total_time_ms:>8.2%}")

print(f'\nTotal time accounted for: {sum_of_kept_times_ms:.0f}ms/{total_time_ms:.0f}ms = {sum_of_kept_times_ms/total_time_ms:.2%}')