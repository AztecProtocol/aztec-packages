/**
 * The `@aztec/accounts` package provides sample account implementations:
 *
 * ```ts
 * const encryptionPrivateKey = GrumpkinScalar.random();
 * const signingPrivateKey = GrumpkinScalar.random();
 * const wallet = getSchnorrAccount(pxe, encryptionPrivateKey, signingPrivateKey).waitDeploy();
 * ```
 *
 * For testing purposes, consider using the {@link createAccount} and {@link createAccounts} methods,
 * which create, register, and deploy random accounts, and return their associated `Wallet`s.
 *
 * For implementing your own account contract, the recommended way is to extend from the base
 * {@link DefaultAccountContract} class in the `defaults` package entrypoint.
 *
 * Read more in {@link https://docs.aztec.network/dev_docs/wallets/writing_an_account_contract | Writing an account contract}.
 *
 * @packageDocumentation
 */

export * from './entrypoint_payload.js';
export * from './account_entrypoint.js';
export * from './account_interface.js';
export * from './account_contract.js';
export * from './constants.js';
