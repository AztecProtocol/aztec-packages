export const DEFAULT_TEST_MNEMONIC = 'test test test test test test test test test test test junk';

const LOCAL_L1_CHAIN_IDS = new Set([1337, 31337]);

export function assertSafeL1Signer({
  chainId,
  privateKey,
  mnemonic,
  mnemonicWasExplicit,
  allowDefaultMnemonic,
}: {
  chainId: number;
  privateKey?: string;
  mnemonic: string;
  mnemonicWasExplicit: boolean;
  allowDefaultMnemonic: boolean;
}) {
  const usesImplicitTestMnemonic =
    !privateKey && mnemonic === DEFAULT_TEST_MNEMONIC && !mnemonicWasExplicit && !allowDefaultMnemonic;
  if (LOCAL_L1_CHAIN_IDS.has(chainId) || !usesImplicitTestMnemonic) {
    return;
  }

  throw new Error(
    `--l1-chain-id ${chainId} is not a local network, but no --l1-private-key or explicit --mnemonic was provided. ` +
      'Refusing to sign with the public default test mnemonic. Pass --l1-private-key, an explicit --mnemonic, ' +
      'or --i-know-this-uses-the-public-test-mnemonic to proceed.',
  );
}
