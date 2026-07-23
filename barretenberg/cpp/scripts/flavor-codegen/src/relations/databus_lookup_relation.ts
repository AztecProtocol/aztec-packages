import { relation } from "../relation.js";
import type { EntityDecl, EntityName, Relation } from "../types.js";

// Fixed (non-bus) entities every bus column reads.
const FIXED_ENTITIES: readonly EntityDecl[] = [
    { name: "w_l", kind: "witness" },
    { name: "w_r", kind: "witness" },
    { name: "q_busread", kind: "precomputed" },
    { name: "databus_id", kind: "precomputed" },
];

export interface SingleBusLookupSpec {
    readonly bus: string;
    readonly value: EntityName;
    readonly readCounts: EntityName;
    readonly inverses: EntityName;
    readonly indicator: EntityName;
    readonly selector: EntityName;
}

// One `SingleBusLookupRelation<FF, ...>` instantiation per bus.
export function singleBusLookupRelation(spec: SingleBusLookupSpec): Relation {
    const busEntities: EntityDecl[] = [
        { name: spec.value, kind: "witness" },
        { name: spec.readCounts, kind: "witness" },
        { name: spec.inverses, kind: "witness" },
        { name: spec.indicator, kind: "precomputed" },
        { name: spec.selector, kind: "precomputed" },
    ];

    return relation({
        id: `single_bus_lookup_${spec.bus}`,
        cppName: "bb::SingleBusLookupRelation",
        header: "barretenberg/relations/databus_lookup_relation.hpp",
        cppExtraTemplateArgs: [
            `EntityId::${spec.value}`,
            `EntityId::${spec.readCounts}`,
            `EntityId::${spec.inverses}`,
            `EntityId::${spec.indicator}`,
            `EntityId::${spec.selector}`,
        ],
        entities: [...FIXED_ENTITIES, ...busEntities],
        gateBlockName: "busread",
        subsets: {
            gate_selectors: ["q_busread"],
            // Unioned across bus relations: N buses → N entries per subset.
            databus_entities: [spec.value, spec.readCounts],
            databus_inverses: [spec.inverses],
            databus_indicators: [spec.indicator],
            databus_selectors: [spec.selector],
        },
    });
}
