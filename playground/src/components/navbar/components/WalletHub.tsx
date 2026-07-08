import { navbarButtonStyle, navbarSelect, navbarSelectLabel } from '../../../styles/common';
import WalletIcon from '@mui/icons-material/Wallet';
import {
  CircularProgress,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  Typography,
  Box,
  Tooltip,
  Button,
  Alert,
} from '@mui/material';

import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import SettingsIcon from '@mui/icons-material/Settings';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import SecurityIcon from '@mui/icons-material/Security';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useContext, useEffect, useState, useRef } from 'react';
import { EmbeddedWallet } from '@aztec/wallets/embedded';
import { WebLogger } from '../../../utils/web_logger';
import { getInitialTestAccountsData } from '@aztec/accounts/testing/lazy';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { type DeployOptions, DeployMethod } from '@aztec/aztec.js/contracts';
import { AztecContext } from '../../../aztecContext';
import { CreateAccountDialog } from '../../../wallet/components/CreateAccountDialog';
import { useTransaction } from '../../../hooks/useTransaction';
import {
  type WalletProvider,
  type PendingConnection,
  type DiscoverySession,
  WalletManager,
} from '@aztec/wallet-sdk/manager';
import { hashToEmoji } from '@aztec/wallet-sdk/crypto';
import { Fr } from '@aztec/foundation/curves/bn254';
import { ContractInitializationStatus, type Wallet } from '@aztec/aztec.js/wallet';

type ExtendedWalletProvider = Omit<WalletProvider, 'type'> & {
  type: WalletProvider['type'] | 'embedded';
  callback?: () => void;
  directConnect?: () => Promise<Wallet>;
};

function EmojiGrid({ emojis, size = 'medium' }: { emojis: string; size?: 'small' | 'medium' | 'large' }) {
  const emojiArray = [...emojis];
  const rows = [emojiArray.slice(0, 3), emojiArray.slice(3, 6), emojiArray.slice(6, 9)];
  const fontSize = size === 'small' ? '0.9rem' : size === 'large' ? '1.8rem' : '1.4rem';

  return (
    <Box sx={{ display: 'inline-flex', flexDirection: 'column', gap: '2px' }}>
      {rows.map((row, i) => (
        <Box key={i} sx={{ display: 'flex', gap: '2px' }}>
          {row.map((emoji, j) => (
            <Box
              key={j}
              sx={{
                fontSize,
                width: '1.2em',
                height: '1.2em',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {emoji}
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}

async function discoverTestAccounts(wallet: EmbeddedWallet) {
  const testAccountData = await getInitialTestAccountsData();
  const [sampleAccount] = testAccountData;
  if (!sampleAccount) {
    return;
  }

  const existingAccounts = await wallet.getAccounts();
  if (existingAccounts.find(aliased => aliased.item.equals(sampleAccount.address))) {
    return;
  }

  const { initializationStatus } = await wallet.getContractMetadata(sampleAccount.address);
  if (initializationStatus !== ContractInitializationStatus.INITIALIZED) {
    return;
  }

  for (let i = 0; i < testAccountData.length; i++) {
    const accountData = testAccountData[i];
    await wallet.createSchnorrAccount(accountData.secret, accountData.salt, accountData.signingKey, `test${i}`);
  }
}

type ConnectionPhase = 'idle' | 'connecting' | 'verifying' | 'finalizing';

export function WalletHub() {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ExtendedWalletProvider | null>(null);
  const [openWalletModal, setOpenWalletModal] = useState(false);
  const [providers, setProviders] = useState<ExtendedWalletProvider[]>([]);
  const { setWallet, network, wallet, setIsEmbeddedWalletSelected, setFrom } = useContext(AztecContext);
  const { sendTx } = useTransaction();

  const [connectionPhase, setConnectionPhase] = useState<ConnectionPhase>('idle');
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [pendingProvider, setPendingProvider] = useState<ExtendedWalletProvider | null>(null);
  const [cancelledWalletIds, setCancelledWalletIds] = useState<Set<string>>(new Set());

  const disconnectUnsubscribeRef = useRef<(() => void) | null>(null);
  const discoverySessionRef = useRef<DiscoverySession | null>(null);

  useEffect(() => {
    if (network) {
      discoverWallets();
    }

    return () => {
      if (discoverySessionRef.current) {
        discoverySessionRef.current.cancel();
        discoverySessionRef.current = null;
      }
    };
  }, [network]);

  useEffect(() => {
    return () => {
      if (disconnectUnsubscribeRef.current) {
        disconnectUnsubscribeRef.current();
      }
      if (discoverySessionRef.current) {
        discoverySessionRef.current.cancel();
      }
    };
  }, []);

  async function discoverWallets() {
    if (!network) return;

    if (discoverySessionRef.current) {
      discoverySessionRef.current.cancel();
      discoverySessionRef.current = null;
    }

    setLoading(true);
    setCancelledWalletIds(new Set());

    const embeddedWallet: ExtendedWalletProvider = {
      id: 'embedded',
      type: 'embedded',
      name: 'Embedded wallet',
      icon: new URL('../../../assets/aztec_logo.png', import.meta.url).href,
      directConnect: async () => {
        const w = await EmbeddedWallet.create(network.nodeURL, {
          logger: WebLogger.getInstance().createLogger('embedded-wallet'),
          pxeConfig: { proverEnabled: true },
        });
        await discoverTestAccounts(w);
        return w;
      },
      establishSecureChannel: async () => {
        throw new Error('Embedded wallet should use directConnect');
      },
      disconnect: async () => {},
      onDisconnect: () => () => {},
      isDisconnected: () => false,
      callback: () => {
        setOpenWalletModal(true);
      },
    };

    setProviders([embeddedWallet]);

    await connectProvider(embeddedWallet);

    const discovery = WalletManager.configure({
      extensions: { enabled: true },
      webWallets: { urls: [] },
    }).getAvailableWallets({
      chainInfo: {
        chainId: new Fr(network.chainId),
        version: new Fr(network.version),
      },
      appId: 'play.aztec.network',
      timeout: 60000,
    });

    discoverySessionRef.current = discovery;

    for await (const wallet of discovery.wallets) {
      setProviders(prev => [...prev, wallet]);
    }
  }

  async function connectProvider(provider: ExtendedWalletProvider) {
    try {
      setLoading(true);
      setOpen(false);

      if (selectedProvider) {
        if (disconnectUnsubscribeRef.current) {
          disconnectUnsubscribeRef.current();
          disconnectUnsubscribeRef.current = null;
        }
        try {
          await selectedProvider.disconnect();
        } catch (error) {
          console.warn('Error disconnecting previous wallet:', error);
        }
      }

      setFrom(null);

      if (provider.type === 'embedded') {
        setConnectionPhase('connecting');
        setSelectedProvider(provider);
        setIsEmbeddedWalletSelected(true);

        const connectedWallet = await provider.directConnect();
        setWallet(connectedWallet);
        setConnectionPhase('idle');
        setLoading(false);
        return;
      }

      setConnectionPhase('connecting');
      setPendingProvider(provider);

      const pending = await provider.establishSecureChannel('play.aztec.network');
      setPendingConnection(pending);
      setConnectionPhase('verifying');
      setLoading(false);
      setOpen(true);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      setConnectionPhase('idle');
      setPendingConnection(null);
      setPendingProvider(null);
      setLoading(false);
    }
  }

  async function confirmConnection() {
    if (!pendingConnection || !pendingProvider) return;

    try {
      setConnectionPhase('finalizing');
      setLoading(true);

      const connectedWallet = await pendingConnection.confirm();

      setSelectedProvider(pendingProvider);
      setIsEmbeddedWalletSelected(false);

      disconnectUnsubscribeRef.current = pendingProvider.onDisconnect(() => {
        setWallet(null);
        setSelectedProvider(null);
        setFrom(null);
        disconnectUnsubscribeRef.current = null;
        discoverWallets();
      });

      setWallet(connectedWallet);
      setConnectionPhase('idle');
      setPendingConnection(null);
      setPendingProvider(null);
      setOpen(false);
    } catch (error) {
      console.error('Failed to confirm connection:', error);
      setConnectionPhase('idle');
      setPendingConnection(null);
      setPendingProvider(null);
    } finally {
      setLoading(false);
    }
  }

  function cancelConnection() {
    if (pendingConnection) {
      pendingConnection.cancel();
    }
    if (pendingProvider) {
      setCancelledWalletIds(prev => new Set(prev).add(pendingProvider.id));
    }
    setConnectionPhase('idle');
    setPendingConnection(null);
    setPendingProvider(null);
  }

  async function handleProviderChanged(providerId: string) {
    const provider = providers.find(p => p.id === providerId);
    if (provider) {
      await connectProvider(provider);
    }
  }

  async function handleEmbeddedWalletModalClose(
    address: AztecAddress,
    publiclyDeploy: boolean,
    interaction?: DeployMethod,
    opts?: DeployOptions,
  ) {
    setOpenWalletModal(false);
    if (address && publiclyDeploy && interaction && opts) {
      await sendTx('Deploy account contract', interaction, address, opts);
    }
  }

  if (loading) {
    return (
      <div css={navbarButtonStyle}>
        <CircularProgress size={20} color="primary" sx={{ marginRight: '1rem' }} />
        <Typography variant="body1">Loading wallet...</Typography>
      </div>
    );
  }

  return (
    <div css={navbarButtonStyle}>
      <WalletIcon />

      <FormControl css={navbarSelect}>
        <Select
          fullWidth
          value={selectedProvider?.id || ''}
          displayEmpty
          variant="outlined"
          IconComponent={KeyboardArrowDownIcon}
          open={open}
          onOpen={() => setOpen(true)}
          onClose={() => {
            if (connectionPhase !== 'verifying') {
              setOpen(false);
            }
          }}
          renderValue={selected => {
            if (loading) {
              return `Loading ${selectedProvider?.name}...`;
            }
            if (selected && selectedProvider?.name) {
              return selectedProvider.name;
            }
            return 'Select Wallet';
          }}
          disabled={loading || connectionPhase === 'verifying'}
          onChange={e => handleProviderChanged(e.target.value)}
          MenuProps={{
            disableScrollLock: true,
            PaperProps: {
              sx: {
                width: '300px',
                '@media (max-width: 900px)': {
                  width: '100vw',
                },
              },
            },
          }}
        >
          {connectionPhase === 'verifying' && pendingConnection && pendingProvider && (
            <Box sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                {pendingProvider.icon ? (
                  <img src={pendingProvider.icon} style={{ height: '40px', borderRadius: '8px' }} />
                ) : (
                  <Box
                    sx={{
                      height: '40px',
                      width: '40px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                    }}
                  >
                    <AccountBalanceWalletIcon sx={{ fontSize: '24px', color: 'var(--mui-palette-primary-main)' }} />
                  </Box>
                )}
                <Typography variant="body1" fontWeight={600}>
                  {pendingProvider.name}
                </Typography>
              </Box>

              <Box
                sx={{
                  p: 2,
                  backgroundColor: 'rgba(0, 0, 0, 0.2)',
                  borderRadius: 1,
                  display: 'flex',
                  justifyContent: 'center',
                  mb: 2,
                }}
              >
                <EmojiGrid emojis={hashToEmoji(pendingConnection.verificationHash)} size="large" />
              </Box>

              <Alert
                severity="info"
                icon={<SecurityIcon fontSize="small" />}
                sx={{ mb: 2, '& .MuiAlert-message': { fontSize: '0.75rem' } }}
              >
                Verify this code matches your wallet. If it doesn't match, click Cancel.
              </Alert>

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant="outlined" color="inherit" onClick={cancelConnection} sx={{ flex: 1 }} size="small">
                  Cancel
                </Button>
                <Button variant="contained" color="primary" onClick={confirmConnection} sx={{ flex: 1 }} size="small">
                  Confirm
                </Button>
              </Box>
            </Box>
          )}

          {/* Normal wallet selection */}
          {connectionPhase !== 'verifying' && !network && (
            <div css={navbarSelectLabel}>
              <Typography variant="body2" color="warning.main">
                Note: Connect to a network first to select available wallets
              </Typography>
            </div>
          )}
          {connectionPhase !== 'verifying' && network && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 2,
                py: 1,
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Available wallets
              </Typography>
              <Tooltip title="Refresh wallet list">
                <IconButton
                  size="small"
                  onClick={e => {
                    e.stopPropagation();
                    e.preventDefault();
                    discoverWallets();
                  }}
                >
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          )}
          {connectionPhase !== 'verifying' &&
            network &&
            providers.map(provider => {
              const isCancelled = cancelledWalletIds.has(provider.id);
              return (
                <MenuItem
                  key={provider.id}
                  value={provider.id}
                  disabled={isCancelled}
                  sx={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    opacity: isCancelled ? 0.5 : 1,
                  }}
                >
                  {provider.icon ? (
                    <img
                      src={provider.icon}
                      style={{
                        height: '50px',
                        marginRight: '0.5rem',
                        filter: isCancelled ? 'grayscale(100%)' : 'none',
                      }}
                    />
                  ) : (
                    <Box
                      sx={{
                        height: '50px',
                        width: '50px',
                        marginRight: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                      }}
                    >
                      <AccountBalanceWalletIcon
                        sx={{
                          fontSize: '28px',
                          color: isCancelled ? 'text.disabled' : 'var(--mui-palette-primary-main)',
                        }}
                      />
                    </Box>
                  )}
                  <Box>
                    <Typography variant="body1" color={isCancelled ? 'text.disabled' : 'text.primary'}>
                      {provider.name}
                    </Typography>
                    {isCancelled && (
                      <Typography variant="caption" color="text.disabled">
                        Connection cancelled - refresh to retry
                      </Typography>
                    )}
                  </Box>
                </MenuItem>
              );
            })}
        </Select>
      </FormControl>
      {selectedProvider && selectedProvider.callback && (
        <IconButton
          onClick={event => {
            event.stopPropagation();
            selectedProvider.callback();
          }}
        >
          <SettingsIcon />
        </IconButton>
      )}
      {openWalletModal && (
        <CreateAccountDialog
          wallet={wallet as unknown as EmbeddedWallet}
          open={openWalletModal}
          onClose={(address, publiclyDeploy, interaction, opts) =>
            handleEmbeddedWalletModalClose(address, publiclyDeploy, interaction, opts)
          }
        />
      )}
    </div>
  );
}
