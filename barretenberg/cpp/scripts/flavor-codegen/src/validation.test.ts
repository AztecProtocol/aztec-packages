import assert from "node:assert/strict";
import test from "node:test";
import { flavor } from "./flavor.js";
import { Mega } from "./flavors/mega.js";
import { MegaApp } from "./flavors/mega_app.js";
import { MegaAvm } from "./flavors/mega_avm.js";
import { MegaKernel } from "./flavors/mega_kernel.js";
import { MegaZK } from "./flavors/mega_zk.js";
import { Ultra } from "./flavors/ultra.js";
import { UltraZK } from "./flavors/ultra_zk.js";
import { builderBusIndices } from "./trace.js";

test("shipped flavors retain their builder bus mappings", () => {
    for (const [input, expected] of [
        [Mega, [0, 1, 2, 3, 4, 5, 6]],
        [MegaApp, [6]],
        [MegaKernel, [0, 1, 2, 3, 4, 5, 6]],
        [MegaZK, [0]],
        [MegaAvm, []],
        [Ultra, []],
        [UltraZK, []],
    ] as const) {
        assert.deepEqual(builderBusIndices(flavor(input)), expected);
    }
});

test("bilinear requires q_5 even when no other relation declares the entity", () => {
    assert.throws(() => flavor({
        ...MegaZK,
        relations: MegaZK.relations.filter(r => !r.id.startsWith("poseidon2")),
    }), { message: "MegaZKFlavor: bilinear_batched_eq requires 'q_5' in non_gate_selectors" });
});

test("the fourth databus q_5 entity requires selector classification", () => {
    assert.throws(() => flavor({
        ...Mega,
        relations: Mega.relations.filter(r => !r.id.startsWith("poseidon2")),
    }), { message: "MegaFlavor: selector 'q_5' is in neither gate_selectors nor non_gate_selectors" });
});

test("declared non-gate selectors cannot lose their builder bridge", () => {
    assert.throws(() => flavor({
        ...Ultra,
        relations: Ultra.relations.map(r => ({
            ...r,
            subsets: { ...r.subsets, non_gate_selectors: (r.subsets.non_gate_selectors ?? []).filter(s => s !== "q_m") },
        })),
    }), /q_m.*neither gate_selectors nor non_gate_selectors/);
});

test("two bus relations cannot share a builder selector", () => {
    const bus = Mega.relations.find(r => r.id.startsWith("single_bus_lookup_"))!;
    assert.throws(() => flavor({
        ...Mega,
        relations: [...Mega.relations, { ...bus, id: "single_bus_lookup_duplicate" }],
    }), /duplicate databus selector/);
});

test("each bus relation declares exactly one selector", () => {
    for (const selectors of [[], ["q_l", "q_r"]]) {
        assert.throws(() => flavor({
            ...Mega,
            relations: Mega.relations.map(r => r.id === "single_bus_lookup_kernel_calldata"
                ? { ...r, subsets: { ...r.subsets, databus_selectors: selectors } }
                : r),
        }), /exactly one databus selector/);
    }
});
