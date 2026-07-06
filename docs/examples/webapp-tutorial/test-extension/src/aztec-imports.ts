/**
 * Centralized lazy import cache for Aztec SDK modules.
 *
 * The offscreen document uses dynamic imports to keep startup fast — we don't
 * want to load Barretenberg, Schnorr account contracts, etc. until the user
 * actually triggers an operation. But the same imports were scattered across
 * 5+ locations with no shared cache.
 *
 * This module loads all needed Aztec imports once, caches them, and provides
 * a typed interface for consumers. The module system caches the underlying
 * import() calls, but this provides a single entry point and avoids repeating
 * the destructuring boilerplate.
 */

/** Core imports needed for account operations (key derivation, contract setup) */
export interface AztecCoreImports {
  Fr: typeof import("@aztec/aztec.js/fields").Fr;
  GrumpkinScalar: typeof import("@aztec/aztec.js/fields").GrumpkinScalar;
  AztecAddress: typeof import("@aztec/aztec.js/addresses").AztecAddress;
  deriveKeys: typeof import("@aztec/stdlib/keys").deriveKeys;
  deriveSecretKeyFromSigningKey: typeof import("@aztec/accounts/utils").deriveSecretKeyFromSigningKey;
  SchnorrAccountContract: typeof import("@aztec/accounts/schnorr/lazy").SchnorrAccountContract;
  getContractInstanceFromInstantiationParams: typeof import("@aztec/aztec.js/contracts").getContractInstanceFromInstantiationParams;
  AccountManager: typeof import("@aztec/aztec.js/wallet").AccountManager;
}

/** Additional imports for the wallet runtime (BaseWallet, serialization) */
export interface AztecWalletImports extends AztecCoreImports {
  BaseWallet: typeof import("@aztec/wallet-sdk/base-wallet").BaseWallet;
  SignerlessAccount: typeof import("@aztec/aztec.js/account").SignerlessAccount;
  WalletSchema: typeof import("@aztec/aztec.js/wallet").WalletSchema;
  jsonStringify: typeof import("@aztec/foundation/json-rpc").jsonStringify;
  schemaHasMethod: typeof import("@aztec/foundation/schemas").schemaHasMethod;
}

/** Deploy-specific imports (fee payment, SponsoredFPC) */
export interface AztecDeployImports extends AztecCoreImports {
  SponsoredFeePaymentMethod: typeof import("@aztec/aztec.js/fee").SponsoredFeePaymentMethod;
  SponsoredFPCContract: typeof import("@aztec/noir-contracts.js/SponsoredFPC").SponsoredFPCContract;
  SPONSORED_FPC_SALT: typeof import("@aztec/constants").SPONSORED_FPC_SALT;
}

let coreCache: AztecCoreImports | null = null;
let walletCache: AztecWalletImports | null = null;
let deployCache: AztecDeployImports | null = null;

/**
 * Loads the core Aztec imports needed for account operations.
 * Cached after first call.
 */
export async function getAztecCore(): Promise<AztecCoreImports> {
  if (coreCache) return coreCache;

  const [fields, addresses, keys, accountUtils, schnorr, contracts, wallet] =
    await Promise.all([
      import("@aztec/aztec.js/fields"),
      import("@aztec/aztec.js/addresses"),
      import("@aztec/stdlib/keys"),
      import("@aztec/accounts/utils"),
      import("@aztec/accounts/schnorr/lazy"),
      import("@aztec/aztec.js/contracts"),
      import("@aztec/aztec.js/wallet"),
    ]);

  coreCache = {
    Fr: fields.Fr,
    GrumpkinScalar: fields.GrumpkinScalar,
    AztecAddress: addresses.AztecAddress,
    deriveKeys: keys.deriveKeys,
    deriveSecretKeyFromSigningKey: accountUtils.deriveSecretKeyFromSigningKey,
    SchnorrAccountContract: schnorr.SchnorrAccountContract,
    getContractInstanceFromInstantiationParams:
      contracts.getContractInstanceFromInstantiationParams,
    AccountManager: wallet.AccountManager,
  };

  return coreCache;
}

/**
 * Loads the wallet runtime imports (core + BaseWallet, serialization).
 * Cached after first call.
 */
export async function getAztecWallet(): Promise<AztecWalletImports> {
  if (walletCache) return walletCache;

  const [core, bw, account, walletMod, jsonRpc, schemas] = await Promise.all([
    getAztecCore(),
    import("@aztec/wallet-sdk/base-wallet"),
    import("@aztec/aztec.js/account"),
    import("@aztec/aztec.js/wallet"),
    import("@aztec/foundation/json-rpc"),
    import("@aztec/foundation/schemas"),
  ]);

  walletCache = {
    ...core,
    BaseWallet: bw.BaseWallet,
    SignerlessAccount: account.SignerlessAccount,
    WalletSchema: walletMod.WalletSchema,
    jsonStringify: jsonRpc.jsonStringify,
    schemaHasMethod: schemas.schemaHasMethod,
  };

  return walletCache;
}

/**
 * Loads the deploy-specific imports (core + fee payment, SponsoredFPC).
 * Cached after first call.
 */
export async function getAztecDeploy(): Promise<AztecDeployImports> {
  if (deployCache) return deployCache;

  const [core, fee, sponsoredFpc, constants] = await Promise.all([
    getAztecCore(),
    import("@aztec/aztec.js/fee"),
    import("@aztec/noir-contracts.js/SponsoredFPC"),
    import("@aztec/constants"),
  ]);

  deployCache = {
    ...core,
    SponsoredFeePaymentMethod: fee.SponsoredFeePaymentMethod,
    SponsoredFPCContract: sponsoredFpc.SponsoredFPCContract,
    SPONSORED_FPC_SALT: constants.SPONSORED_FPC_SALT,
  };

  return deployCache;
}
