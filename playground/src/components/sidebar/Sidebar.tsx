import { css } from '@mui/styled-engine';
import { type SelectChangeEvent } from '@mui/material/Select';
import { AztecContext } from '../../aztecEnv';
import { AztecAddress } from '@aztec/aztec.js';
import { useContext, useEffect, useState } from 'react';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import { formatFrAsString, parseAliasedBuffersAsString } from '../../utils/conversion';
import { TxsPanel } from './components/TxsPanel';
import { NetworkSelector } from './components/NetworkSelector';
import { AccountSelector } from './components/AccountSelector';
import { AddressBook } from './components/AddressBook';
import { ContractSelector } from './components/ContractSelector';
import { ButtonWithModal } from './components/ButtonWithModal';

const container = css({
  width: '20%',
  backgroundColor: '#E9E9E9',
  overflow: 'auto',
  flexShrink: 0,
  flexGrow: 0,
  borderRadius: '10px',
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
  transition: 'all 0.3s ease-out',
  padding: '20px',
  margin: '0 24px 0 0',
  '@media (max-width: 1200px)': {
    width: 'auto',
    maxHeight: '300px',
    margin: 0,
  },
});

export function SidebarComponent() {
  const { connecting, network, wallet, walletDB, currentContractAddress } = useContext(AztecContext);

  const [isNetworkConnected, setIsNetworkConnected] = useState(false);
  const [walletAlias, setWalletAlias] = useState<string | undefined>(undefined);
  const [contractAlias, setContractAlias] = useState<string | undefined>(undefined);

  useEffect(() => {
    setIsNetworkConnected(!connecting && !!network?.nodeURL);
  }, [connecting, network]);

  useEffect(() => {
    const refreshAlias = async () => {
      const aliasedBuffers = await walletDB.listAliases('accounts');
      const aliasedAccounts = parseAliasedBuffersAsString(aliasedBuffers);
      const alias = aliasedAccounts.find(({ value }) => wallet.getAddress().equals(AztecAddress.fromString(value)));
      setWalletAlias(alias?.key.replace('accounts:', ''));
    };

    if (wallet && walletDB) {
      refreshAlias();
    }
  }, [wallet]);

  useEffect(() => {
    const refreshContracts = async () => {
      const aliasedBuffers = await walletDB.listAliases('contracts');
      const aliasedContracts = parseAliasedBuffersAsString(aliasedBuffers);
      const alias = aliasedContracts.find(({ value }) => wallet.getAddress().equals(AztecAddress.fromString(value)));
      setContractAlias(alias?.key.replace('contracts:', ''));
    };

    if (walletDB) {
      refreshContracts();
    }
  });

  const [activeSection, setActiveSection] = useState('network');

  const handleSectionToggle = (section: 'network' | 'account' | 'contract') => {
    // Toggle off when clicking the same section
    setActiveSection(activeSection === section ? '' : section);
  };

  // Get button text based on connection state
  const getNetworkButtonText = () => {
    if (connecting) return 'Connecting...';
    if (isNetworkConnected) return `Connected to ${network.name}`;
    return 'Connect to Network';
  };

  const getAccountButtonText = () => {
    if (!wallet) return 'Connect Account';
    return `${walletAlias || formatFrAsString(wallet.getAddress().toString())} Account`;
  };

  const getContractButtonText = () => {
    if (!currentContractAddress) return 'Select Contract';

    return `${contractAlias || formatFrAsString(currentContractAddress.toString())} Contract`;
  };

  return (
    <div css={container}>
      <Typography variant="overline">Connect</Typography>
      <ButtonWithModal
        label="Select Network"
        isActive={activeSection === 'network'}
        isSelected={isNetworkConnected}
        isLoading={connecting}
        connectionStatus={getNetworkButtonText()}
        onClick={() => handleSectionToggle('network')}
      >
        <NetworkSelector />
      </ButtonWithModal>
      <ButtonWithModal
        label="Connect Account"
        isActive={activeSection === 'account'}
        isSelected={!!wallet}
        connectionStatus={getAccountButtonText()}
        onClick={() => handleSectionToggle('account')}
      >
        <AccountSelector />
      </ButtonWithModal>
      <ButtonWithModal
        label="Select Contract"
        isActive={activeSection === 'contract'}
        isSelected={!!currentContractAddress}
        connectionStatus={getContractButtonText()}
        onClick={() => handleSectionToggle('contract')}
      >
        <ContractSelector />
      </ButtonWithModal>
      <div css={{ flex: '1 0 auto', margin: 'auto' }} />
      <AddressBook />
      <TxsPanel css={{ marginBottom: 60 }} />
    </div>
  );
}
