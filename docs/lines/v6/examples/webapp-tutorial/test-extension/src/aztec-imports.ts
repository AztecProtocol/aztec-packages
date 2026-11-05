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
  Fr: typeof import("@aztec-labs/aztec.js/fields").Fr;
  GrumpkinScalar: typeof import("@aztec-labs/aztec.js/fields").GrumpkinScalar;
  AztecAddress: typeof import("@aztec-labs/aztec.js/addresses").AztecAddress;
  NO_FROM: typeof import("@aztec-labs/aztec.js/account").NO_FROM;
  deriveKeys: typeof import("@aztec-labs/stdlib/keys").deriveKeys;
  deriveSecretKeyFromSigningKey: typeof import("@aztec-labs/accounts/utils").deriveSecretKeyFromSigningKey;
  SchnorrAccountContract: typeof import("@aztec-labs/accounts/schnorr/lazy").SchnorrAccountContract;
  getContractInstanceFromInstantiationParams: typeof import("@aztec-labs/aztec.js/contracts").getContractInstanceFromInstantiationParams;
  AccountManager: typeof import("@aztec-labs/aztec.js/wallet").AccountManager;
}

/** Additional imports for the wallet runtime (BaseWallet, serialization) */
export interface AztecWalletImports extends AztecCoreImports {
  BaseWallet: typeof import("@aztec-labs/wallet-sdk/base-wallet").BaseWallet;
  WalletSchema: typeof import("@aztec-labs/aztec.js/wallet").WalletSchema;
  jsonStringify: typeof import("@aztec-labs/foundation/json-rpc").jsonStringify;
  schemaHasMethod: typeof import("@aztec-labs/foundation/schemas").schemaHasMethod;
  getSchemaParameters: typeof import("@aztec-labs/foundation/schemas").getSchemaParameters;
  parseWithOptionals: typeof import("@aztec-labs/foundation/schemas").parseWithOptionals;
}

/** Deploy-specific imports (fee payment, SponsoredFPC) */
export interface AztecDeployImports extends AztecCoreImports {
  SponsoredFeePaymentMethod: typeof import("@aztec-labs/aztec.js/fee").SponsoredFeePaymentMethod;
  SponsoredFPCContract: typeof import("@aztec-labs/noir-contracts.js/SponsoredFPC").SponsoredFPCContract;
  SPONSORED_FPC_SALT: typeof import("@aztec-labs/constants").SPONSORED_FPC_SALT;
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

  const [
    fields,
    addresses,
    account,
    keys,
    accountUtils,
    schnorr,
    contracts,
    wallet,
  ] = await Promise.all([
    import("@aztec-labs/aztec.js/fields"),
    import("@aztec-labs/aztec.js/addresses"),
    import("@aztec-labs/aztec.js/account"),
    import("@aztec-labs/stdlib/keys"),
    import("@aztec-labs/accounts/utils"),
    import("@aztec-labs/accounts/schnorr/lazy"),
    import("@aztec-labs/aztec.js/contracts"),
    import("@aztec-labs/aztec.js/wallet"),
  ]);

  coreCache = {
    Fr: fields.Fr,
    GrumpkinScalar: fields.GrumpkinScalar,
    AztecAddress: addresses.AztecAddress,
    NO_FROM: account.NO_FROM,
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

  const [core, bw, walletMod, jsonRpc, schemas] = await Promise.all([
    getAztecCore(),
    import("@aztec-labs/wallet-sdk/base-wallet"),
    import("@aztec-labs/aztec.js/wallet"),
    import("@aztec-labs/foundation/json-rpc"),
    import("@aztec-labs/foundation/schemas"),
  ]);

  walletCache = {
    ...core,
    BaseWallet: bw.BaseWallet,
    WalletSchema: walletMod.WalletSchema,
    jsonStringify: jsonRpc.jsonStringify,
    schemaHasMethod: schemas.schemaHasMethod,
    getSchemaParameters: schemas.getSchemaParameters,
    parseWithOptionals: schemas.parseWithOptionals,
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
    import("@aztec-labs/aztec.js/fee"),
    import("@aztec-labs/noir-contracts.js/SponsoredFPC"),
    import("@aztec-labs/constants"),
  ]);

  deployCache = {
    ...core,
    SponsoredFeePaymentMethod: fee.SponsoredFeePaymentMethod,
    SponsoredFPCContract: sponsoredFpc.SponsoredFPCContract,
    SPONSORED_FPC_SALT: constants.SPONSORED_FPC_SALT,
  };

  return deployCache;
}
