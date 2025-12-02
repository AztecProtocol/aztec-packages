import { navbarButtonStyle, navbarSelect, navbarSelectLabel } from '../../../styles/common';
import WalletIcon from '@mui/icons-material/Wallet';
import { CircularProgress, FormControl, IconButton, MenuItem, Select, Typography, Box } from '@mui/material';

import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import SettingsIcon from '@mui/icons-material/Settings';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import { useContext, useEffect, useState } from 'react';
import { EmbeddedWallet } from '../../../wallet/embedded_wallet';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { type DeployOptions, DeployMethod } from '@aztec/aztec.js/contracts';
import { AztecContext } from '../../../aztecContext';
import { CreateAccountDialog } from '../../../wallet/components/CreateAccountDialog';
import { useTransaction } from '../../../hooks/useTransaction';
import { type WalletProvider, WalletManager } from '@aztec/wallet-sdk/manager';
import { Fr } from '@aztec/foundation/fields';

// Extend WalletProvider locally for UI properties
type ExtendedWalletProvider = WalletProvider & {
  callback?: () => void;
};

export function WalletHub() {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ExtendedWalletProvider | null>(null);
  const [openWalletModal, setOpenWalletModal] = useState(false);
  const [providers, setProviders] = useState<ExtendedWalletProvider[]>([]);
  const { setWallet, network, wallet, setIsEmbeddedWalletSelected, setFrom } = useContext(AztecContext);
  const { sendTx } = useTransaction();

  useEffect(() => {
    if (network) {
      discoverWallets();
    }
  }, [network]);

  async function discoverWallets() {
    if (!network) return;
    setLoading(true);

    const wallets = await WalletManager.configure({
      extensions: { enabled: true },
      webWallets: { urls: [] },
    }).getAvailableWallets({
      chainInfo: {
        chainId: new Fr(network.chainId),
        version: new Fr(network.version),
      },
      timeout: 200,
    });

    const embeddedWallet: ExtendedWalletProvider = {
      id: 'embedded',
      type: 'embedded',
      name: 'Embedded wallet',
      icon: new URL('../../../assets/aztec_logo.png', import.meta.url).href,
      connect: () =>
        EmbeddedWallet.create({
          chainId: new Fr(network.chainId),
          version: new Fr(network.version),
        }),
      callback: () => {
        setOpenWalletModal(true);
      },
    };

    const allProviders = [embeddedWallet, ...wallets];
    setProviders(allProviders);

    // Auto-select first provider (always re-connect when network changes)
    if (allProviders.length > 0) {
      const providerToSelect = allProviders[0];
      await connectProvider(providerToSelect);
    }
  }

  async function connectProvider(provider: ExtendedWalletProvider) {
    try {
      setLoading(true);
      setOpen(false);
      setSelectedProvider(provider);
      setIsEmbeddedWalletSelected(provider.type === 'embedded');

      // Reset the selected account when changing wallet/network
      setFrom(null);

      const wallet = await provider.connect('play.aztec.network');
      setWallet(wallet);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    } finally {
      setLoading(false);
    }
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
          onClose={() => setOpen(false)}
          renderValue={selected => {
            if (loading) {
              return `Loading ${selectedProvider?.name}...`;
            }
            if (selected && selectedProvider?.name) {
              return `${selectedProvider.name}`;
            }
            return 'Select Wallet';
          }}
          disabled={loading}
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
          {!network && (
            <div css={navbarSelectLabel}>
              <Typography variant="body2" color="warning.main">
                Note: Connect to a network first to select available wallets
              </Typography>
            </div>
          )}
          {network &&
            providers.map(provider => (
              <MenuItem
                key={provider.id}
                value={provider.id}
                sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}
              >
                {provider.icon ? (
                  <img src={provider.icon} style={{ height: '50px', marginRight: '0.5rem' }} />
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
                    <AccountBalanceWalletIcon sx={{ fontSize: '28px', color: 'var(--mui-palette-primary-main)' }} />
                  </Box>
                )}
                <Typography variant="body1">{provider.name}</Typography>
              </MenuItem>
            ))}
        </Select>
      </FormControl>
      {selectedProvider && selectedProvider.callback && (
        <IconButton
          onClick={event => {
            event.stopPropagation();
            selectedProvider.callback();
          }}
        >
          <SettingsIcon></SettingsIcon>
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
