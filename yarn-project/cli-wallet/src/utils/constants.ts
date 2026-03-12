export const MIN_FEE_PADDING = 0.5;

export const AccountTypes = ['schnorr', 'ecdsasecp256r1', 'ecdsasecp256r1ssh', 'ecdsasecp256k1'] as const;
export type AccountType = (typeof AccountTypes)[number];
