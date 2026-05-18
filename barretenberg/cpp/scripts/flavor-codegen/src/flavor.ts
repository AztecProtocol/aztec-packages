import type { Flavor, Relation } from "./types.js";

interface FlavorInput {
    name: string;
    family: string;
    generatedClassName?: string;
    relations: readonly Relation[];
    composites?: Readonly<Record<string, readonly string[]>>;
    traceExtraBlocks?: readonly string[];
    emitsTrace?: boolean;
}

export function flavor(input: FlavorInput): Flavor {
    const composites: Record<string, readonly string[]> = {};
    for (const [name, parts] of Object.entries(input.composites ?? {})) {
        composites[name] = Object.freeze([...parts]);
    }
    return {
        name: input.name,
        family: input.family,
        generatedClassName: input.generatedClassName ?? defaultGeneratedClassName(input.family),
        relations: Object.freeze([...input.relations]),
        composites: Object.freeze(composites),
        traceExtraBlocks: Object.freeze([...(input.traceExtraBlocks ?? [])]),
        emitsTrace: input.emitsTrace ?? false,
    };
}

// Snake_case → TitleCase; tokens in `ACRONYMS` stay uppercase. Override `generatedClassName`
// for anything outside the allowlist.
const ACRONYMS = new Set(["zk", "vm", "avm", "kzg", "ipa", "fft"]);
function defaultGeneratedClassName(family: string): string {
    const segments = family.split("_").map((seg) => {
        if (ACRONYMS.has(seg.toLowerCase())) return seg.toUpperCase();
        return seg.charAt(0).toUpperCase() + seg.slice(1);
    });
    return `${segments.join("")}Flavor_Generated`;
}
