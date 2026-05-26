// Replaces `@aztec/protocol-contracts/providers/bundle` inside the TXE bundle.
// The real `bundle.ts` statically imports every protocol-contract artifact JSON via the
// eager subpath barrels (`auth-registry/index.js`, etc.), which pulls ~1.1 MiB of bytecode
// into the worker startup chunk. pxe/server's `utils.ts` instantiates this provider as a
// default, even though TXE itself uses `LazyProtocolContractsProvider`.
//
// Since the two providers are interface-compatible (both implement
// `ProtocolContractsProvider`), we just re-export the lazy class under the bundled name.
// Any consumer in the TXE bundle that imports `BundledProtocolContractsProvider` gets the
// lazy behaviour, and the artifact JSONs stay in their own per-contract chunks loaded on
// demand by `getProtocolContractArtifact()`.
export { LazyProtocolContractsProvider as BundledProtocolContractsProvider } from '@aztec/protocol-contracts/providers/lazy';
