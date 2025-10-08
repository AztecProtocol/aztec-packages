import { navbarButtonStyle, navbarSelect, navbarSelectLabel } from '../../../styles/common';
import WalletIcon from '@mui/icons-material/Wallet';
import { CircularProgress, css, FormControl, IconButton, MenuItem, Select, Typography } from '@mui/material';

import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import SettingsIcon from '@mui/icons-material/Settings';
import { useContext, useEffect, useState, type RefObject } from 'react';
import { EmbeddedWallet } from '../../../wallet/embedded_wallet';
import {
  AztecAddress,
  DeployMethod,
  type ContractFunctionInteraction,
  type DeployOptions,
  type Wallet,
} from '@aztec/aztec.js';
import { AztecContext } from '../../../aztecContext';
import { CreateAccountDialog } from '../../../wallet/components/CreateAccountDialog';
import { useTransaction } from '../../../hooks/useTransaction';

const logo = css({
  height: '50px',
  width: '50px',
  marginRight: '1rem',
  objectFit: 'cover',
  objectPosition: 'left',
});

type Provider = {
  name: string;
  getWallet: (nodeUrl: string) => Promise<Wallet>;
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
      getWallet: (nodeUrl: string) => EmbeddedWallet.create(nodeUrl),
      iconURL: new URL('../../../assets/aztec_small_logo.png', import.meta.url).href,
      callback: () => {
        setOpenWalletModal(true);
        return Promise.resolve();
      },
    },
  ];

  async function handleProviderChanged(providerName: string) {
    const provider = providers.find(p => p.name === providerName);
    if (provider) {
      setLoading(true);
      setOpen(false);
      setSelectedProvider(provider);
      setIsEmbeddedWalletSelected(provider === providers[0]);
      const wallet = await provider.getWallet(network.nodeURL);
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
          css={{ marginRight: '1rem' }}
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
