import { DasContextJs } from '@crate-crypto/node-eth-kzg';

export * from '@crate-crypto/node-eth-kzg';

export const kzg = DasContextJs.create({ usePrecomp: true });
