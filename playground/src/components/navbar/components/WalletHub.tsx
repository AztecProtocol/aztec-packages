import { navbarButtonStyle, navbarSelect, navbarSelectLabel } from '../../../styles/common';
import WalletIcon from '@mui/icons-material/Wallet';
import { CircularProgress, FormControl, IconButton, MenuItem, Select, Typography } from '@mui/material';

import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import SettingsIcon from '@mui/icons-material/Settings';
import { useContext, useEffect, useState } from 'react';
import { EmbeddedWallet } from '../../../wallet/embedded_wallet';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { type DeployOptions, DeployMethod } from '@aztec/aztec.js/contracts';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { AztecContext } from '../../../aztecContext';
import { CreateAccountDialog } from '../../../wallet/components/CreateAccountDialog';
import { useTransaction } from '../../../hooks/useTransaction';
import { ExtensionWallet } from '../../../wallet/extension_wallet';
import { Fr } from '@aztec/foundation/fields';
import type { ChainInfo } from '@aztec/aztec.js/account';

type Provider = {
  name: string;
  getWallet: (chainInfo: ChainInfo) => Promise<Wallet>;
  iconURL: string;
  callback: () => Promise<void>;
};

export function WalletHub() {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [openWalletModal, setOpenWalletModal] = useState(false);
  const { setWallet, network, wallet, setIsEmbeddedWalletSelected } = useContext(AztecContext);
  const { sendTx } = useTransaction();

  useEffect(() => {
    if (network) {
      const currentProvider = selectedProvider ?? providers[0];
      handleProviderChanged(currentProvider.name);
    }
  }, [network]);

  const providers: Provider[] = [
    {
      name: 'Embedded wallet',
      getWallet: (chainInfo: ChainInfo) => EmbeddedWallet.create(chainInfo),
      iconURL: new URL('../../../assets/aztec_logo.png', import.meta.url).href,
      callback: () => {
        setOpenWalletModal(true);
        return Promise.resolve();
      },
    },
    // {
    //   name: 'Aztec keychain',
    //   getWallet: (chainInfo: ChainInfo) => Promise.resolve(ExtensionWallet.create(chainInfo, 'play.aztec.network')),
    //   iconURL: new URL('../../../assets/aztec_logo.png', import.meta.url).href,
    //   callback: () => {
    //     return Promise.resolve();
    //   },
    // },
  ];

  async function handleProviderChanged(providerName: string) {
    const provider = providers.find(p => p.name === providerName);
    if (provider) {
      setLoading(true);
      setOpen(false);
      setSelectedProvider(provider);
      setIsEmbeddedWalletSelected(provider === providers[0]);
      const wallet = await provider.getWallet({
        chainId: new Fr(network.chainId),
        version: new Fr(network.version),
      });
      setWallet(wallet);
      setLoading(false);
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
          value={selectedProvider?.name || ''}
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
                key={provider.name}
                value={provider.name}
                sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}
              >
                <img src={provider.iconURL} style={{ height: '50px', marginRight: '0.5rem' }} />
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
          wallet={wallet as EmbeddedWallet}
          open={openWalletModal}
          onClose={(address, publiclyDeploy, interaction, opts) =>
            handleEmbeddedWalletModalClose(address, publiclyDeploy, interaction, opts)
          }
        />
      )}
    </div>
  );
}
