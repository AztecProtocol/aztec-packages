// Generic replacement for `@aztec/protocol-contracts/<contract>/dest/<contract>/index.js` (the
// EAGER subpath barrels). Each of those modules statically imports its artifact JSON via
// `import X from '../../artifacts/X.json' with { type: 'json' }`, which esbuild bundles into
// the worker startup chunk even though `LazyProtocolContractsProvider` is the actual code path
// TXE uses at warm-up.
//
// Archiver, simulator metrics, and aztec-node config import these subpaths solely for their
// *event* classes (e.g. `ContractClassPublishedEvent`) and a few utility helpers. We re-export
// the event modules from the same package using a side-channel that doesn't hit the JSON import
// — see `esbuild.config.mjs` for how each subpath is mapped to its own stub.
//
// This file itself is empty by design; concrete stubs in this folder (e.g.
// `protocol_contract_class_registry_stub.ts`) re-export their event sibling and define noop
// `*Artifact` / `getCanonical*` symbols so TXE never actually evaluates a multi-hundred-KiB
// artifact JSON at worker startup.
export {};
