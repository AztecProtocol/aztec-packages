// Emits `<family>_execution_trace_generated.hpp`: a `<Family>TraceBlockData` struct with members
// `[traceExtraBlocks..., relation-discovered blocks...]` in `flavor.relations` order (each block
// constructed with its GateKinds), and the concrete `<Family>ExecutionTraceBlocks` trace type.
//
// Blocks are derived from the flavor's own relations, so a flavor that drops a relation gets a trace
// that omits the corresponding block: a gate it cannot constrain has nowhere to be appended, which is
// a compile error rather than an unconstrained row. Flavors whose block/kind shape is identical share
// one emitted trace (see `traceOwners` in main.ts).

import * as fs from "node:fs";
import * as path from "node:path";

import { formatInPlace } from "./format.js";
import type { Flavor } from "./types.js";

// Flavor-entity name → C++ GateKind tag. Shared with flavor codegen (`GATE_KINDS` array).
export const GATE_SELECTOR_TO_GATE_KIND: ReadonlyMap<string, string> = new Map([
    ["q_busread", "BusRead"],
    ["q_lookup", "Lookup"],
    ["q_arith", "Arith"],
    ["q_bilinear_batched_eq", "BilinearBatchedEq"],
    ["q_delta_range", "DeltaRange"],
    ["q_elliptic", "Elliptic"],
    ["q_memory", "Memory"],
    ["q_nnf", "Nnf"],
    ["q_poseidon2_external", "Poseidon2Ext"],
    ["q_poseidon2_internal", "Poseidon2Int"],
    ["q_poseidon2_external_initial", "Poseidon2ExtInitial"],
    ["q_poseidon2_quad_internal", "Poseidon2QuadInt"],
    ["q_poseidon2_quad_internal_terminal", "Poseidon2QuadIntTerminal"],
    ["q_poseidon2_transition_entry", "Poseidon2TransitionEntry"],
]);

// Blocks that carry no gate selector, prepended to the relation-discovered blocks. A property of the
// arithmetization rather than of any one flavor: every flavor over a given arithmetization has them.
//
// `ecc_op` MUST remain first in the Mega trace so `ecc_op_wire[r] == w_shift[r]` holds.
const ARITHMETIZATION_EXTRA_BLOCKS: ReadonlyMap<string, readonly string[]> = new Map([
    ["mega", ["ecc_op", "pub_inputs"]],
    ["ultra", ["pub_inputs"]],
]);

// Snake_case → TitleCase ("ultra_keccak" → "UltraKeccak").
export function titleCase(family: string): string {
    return family
        .split("_")
        .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
        .join("");
}

// The blocks of a flavor's arithmetization: `[traceExtraBlocks..., relation-discovered blocks...]`,
// each with the ordered GateKinds it owns.
export function traceShape(flavor: Flavor): { name: string; kinds: string[] }[] {
    // Discover blocks from relations. `gateBlockName` → ordered list of GateKinds.
    const blockKinds = new Map<string, string[]>();
    const blockOrder: string[] = [];
    for (const r of flavor.relations) {
        if (!r.gateBlockName) continue;
        if (!blockKinds.has(r.gateBlockName)) {
            blockKinds.set(r.gateBlockName, []);
            blockOrder.push(r.gateBlockName);
        }
        const kinds = blockKinds.get(r.gateBlockName)!;
        for (const sel of r.subsets["gate_selectors"] ?? []) {
            const kind = GATE_SELECTOR_TO_GATE_KIND.get(sel);
            if (!kind) {
                throw new Error(
                    `flavor-codegen: gate selector '${sel}' (relation '${r.id}') has no GateKind mapping`
                );
            }
            if (!kinds.includes(kind)) {
                kinds.push(kind);
            }
        }
    }

    const extraBlocks = ARITHMETIZATION_EXTRA_BLOCKS.get(flavor.arithmetization);
    if (!extraBlocks) {
        throw new Error(`flavor-codegen: unknown arithmetization '${flavor.arithmetization}' (flavor '${flavor.name}')`);
    }

    return [
        ...extraBlocks.map((name) => ({ name, kinds: [] as string[] })),
        ...blockOrder.map((name) => ({ name, kinds: blockKinds.get(name)! })),
    ];
}

// Builder databus columns this flavor constrains, as indices into the builder's bus vectors
// (kernel_calldata=0, first..fifth_app_calldata=1..5, return_data=6). The databus is part of the
// arithmetization a builder targets, so it belongs to the trace type alongside the blocks.
export function builderBusIndices(flavor: Flavor): number[] {
    const SELECTOR_TO_BUS_INDEX = new Map<string, number>([
        ["q_l", 0], ["q_r", 1], ["q_o", 2], ["q_4", 3], ["q_5", 4], ["q_c", 5], ["q_m", 6],
    ]);
    const selectors: string[] = [];
    for (const r of flavor.relations) {
        for (const sel of r.subsets["databus_selectors"] ?? []) {
            if (!selectors.includes(sel)) {
                selectors.push(sel);
            }
        }
    }
    return selectors.map((sel) => {
        const idx = SELECTOR_TO_BUS_INDEX.get(sel);
        if (idx === undefined) {
            throw new Error(`flavor-codegen: databus selector '${sel}' has no builder bus_idx mapping`);
        }
        return idx;
    });
}

// Identity of an arithmetization: two flavors with the same signature share one emitted trace type.
export function traceShapeSignature(flavor: Flavor): string {
    return JSON.stringify([flavor.arithmetization, traceShape(flavor), builderBusIndices(flavor)]);
}

// C++ names of the trace types emitted for `family`.
export function traceNames(family: string): { traceTypeName: string; traceBlockDataName: string } {
    const Family = titleCase(family);
    return {
        traceTypeName: `${Family}ExecutionTraceBlocks`,
        traceBlockDataName: `${Family}TraceBlockData`,
    };
}

function emitTraceHeader(flavor: Flavor): string {
    const Family = titleCase(flavor.family);
    const StructName = `${Family}TraceBlockData`;
    const allBlocks = traceShape(flavor);

    const lines: string[] = [];
    lines.push("// AUTOGENERATED FILE — do not edit. Regenerate via:");
    lines.push("//   node barretenberg/cpp/scripts/flavor-codegen/dist/main.js");
    lines.push("//");
    lines.push(`// Source: barretenberg/cpp/scripts/flavor-codegen/src/flavors/${flavor.family}.ts`);
    lines.push("#pragma once");
    lines.push("");
    lines.push("#include <array>");
    lines.push("#include <cstddef>");
    lines.push("#include <cstdint>");
    lines.push("#include <string_view>");
    lines.push("#include <vector>");
    lines.push("");
    lines.push("#include \"barretenberg/common/log.hpp\"");
    lines.push("#include \"barretenberg/common/ref_array.hpp\"");
    lines.push("#include \"barretenberg/ecc/curves/bn254/fr.hpp\"");
    lines.push("#include \"barretenberg/honk/execution_trace/execution_trace_block.hpp\"");
    lines.push(`#include "barretenberg/honk/execution_trace/${flavor.arithmetization}_execution_trace.hpp"`);
    lines.push("");
    lines.push("namespace bb {");
    lines.push("");
    const allKinds = [...new Set(allBlocks.flatMap((b) => b.kinds))];
    lines.push(`struct ${StructName} {`);
    lines.push("    using BlockBase = ExecutionTraceBlockStorage<fr>;");
    lines.push("");
    lines.push("    template <GateKind... Kinds>");
    lines.push("    using Block = ExecutionTraceBlock<fr, Kinds...>;");
    lines.push("");
    for (const { name, kinds } of allBlocks) {
        const ownedKinds = kinds.map((k) => `GateKind::${k}`).join(", ");
        const typedBlock = `Block<${ownedKinds}>`;
        lines.push(`    ${typedBlock} ${name}{};`);
    }
    lines.push("");
    lines.push(`    static constexpr size_t NUM_BLOCKS = ${allBlocks.length};`);
    lines.push("");
    lines.push("    // Every gate kind some block of this trace owns: everything a builder over it can create.");
    lines.push("    static constexpr GateKindMask GATE_KINDS_MASK =");
    lines.push(`        ${allKinds.map((k) => `gate_kind_bit(GateKind::${k})`).join(" | ") || "0"};`);
    lines.push("");
    const busIndices = builderBusIndices(flavor);
    lines.push("    // Databus columns this arithmetization has, as a bitmask over builder bus indices.");
    lines.push(
        `    static constexpr uint32_t BUS_INDICES_MASK = ${
            busIndices.length > 0 ? busIndices.map((i) => `(uint32_t{ 1 } << ${i})`).join(" | ") : "0"
        };`
    );
    lines.push("");
    lines.push("    static constexpr bool has_bus(size_t bus_idx)");
    lines.push("    {");
    lines.push("        return (BUS_INDICES_MASK & (uint32_t{ 1 } << bus_idx)) != 0;");
    lines.push("    }");
    lines.push("");
    lines.push("    /**");
    lines.push("     * @brief Whether this arithmetization has a block owning `kind`, i.e. whether such a gate can");
    lines.push("     * exist in a circuit built on it at all. Gate-creation paths that only some arithmetizations");
    lines.push("     * support test this, either with `static_assert` (the caller is hand-written and the call is");
    lines.push("     * simply wrong) or with `if constexpr` (the caller is generic over arithmetizations, e.g. ACIR");
    lines.push("     * translation, and must fail at runtime on bytecode it cannot represent).");
    lines.push("     */");
    lines.push("    static constexpr bool has_gate_kind(GateKind kind)");
    lines.push("    {");
    lines.push("        return (GATE_KINDS_MASK & gate_kind_bit(kind)) != 0;");
    lines.push("    }");
    lines.push("");
    lines.push("    std::vector<std::string_view> get_labels() const");
    lines.push("    {");
    lines.push("        return {");
    for (const { name } of allBlocks) {
        lines.push(`            "${name}",`);
    }
    lines.push("        };");
    lines.push("    }");
    lines.push("");
    for (const constness of ["", " const"]) {
        const ptrType = constness ? "const BlockBase*" : "BlockBase*";
        lines.push(`    auto get()${constness}`);
        lines.push("    {");
        lines.push(`        return RefArray(std::array<${ptrType}, NUM_BLOCKS>{`);
        for (const { name } of allBlocks) {
            lines.push(`            &${name},`);
        }
        lines.push("        });");
        lines.push("    }");
        lines.push("");
    }
    lines.push("    void summarize() const");
    lines.push("    {");
    lines.push("        info(\"Gate blocks summary:\");");
    for (const { name } of allBlocks) {
        lines.push(`        info("${name.padEnd(24)}: ", this->${name}.size());`);
    }
    lines.push("    }");
    lines.push("");
    lines.push(`    bool operator==(const ${StructName}& other) const = default;`);
    lines.push("};");
    lines.push("");
    const Wrapper = flavor.arithmetization === "mega" ? "MegaExecutionTraceBlocks_" : "UltraExecutionTraceBlocks_";
    lines.push(`// The execution trace of the ${flavor.name} arithmetization. Part of the builder's type: a circuit`);
    lines.push("// built on this trace can only be proven with a flavor whose relations constrain its blocks.");
    lines.push(`using ${Family}ExecutionTraceBlocks = ${Wrapper}<${StructName}>;`);
    lines.push("");
    lines.push("} // namespace bb");
    lines.push("");

    return lines.join("\n");
}

// Write the execution-trace header to disk and return its absolute path.
export function generateTrace(flavor: Flavor, repoRoot: string): string {
    const header = emitTraceHeader(flavor);
    const outDir = path.join(
        repoRoot, "barretenberg", "cpp", "src", "barretenberg", "honk", "execution_trace", "generated"
    );
    const outFile = path.join(outDir, `${flavor.family}_execution_trace_generated.hpp`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, header, "utf8");
    formatInPlace(outFile);
    return outFile;
}
