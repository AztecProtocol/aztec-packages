import { css } from '@mui/styled-engine';
import { AztecContext } from '../../aztecEnv';
import { AztecAddress } from '@aztec/aztec.js';
import { useContext, useEffect, useState } from 'react';
import Typography from '@mui/material/Typography';
import { formatFrAsString, parseAliasedBuffersAsString } from '../../utils/conversion';
import { TxsPanel } from './components/TxsPanel';
import { NetworkSelector } from './components/NetworkSelector';
import { AccountSelector } from './components/AccountSelector';
import { AddressBook } from './components/AddressBook';
import { ContractSelector } from './components/ContractSelector';
import { ButtonWithModal } from './components/ButtonWithModal';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { IconButton } from '@mui/material';
import { dropdownIcon } from '../../styles/common';

const container = css({
  width: '25%',
  height: '100%',
  position: 'relative',
  backgroundColor: '#E9E9E9',
  overflow: 'auto',
  flexShrink: 0,
  flexGrow: 0,
  borderRadius: '10px',
  display: 'flex',
  flexDirection: 'column',
  transition: 'all 0.3s ease-out',
  padding: '20px',
  margin: '0 24px 0 0',
  scrollbarWidth: 'none',
  '@media (max-width: 1200px)': {
    padding: '12px',
    width: 'auto',
    maxHeight: '350px',
    margin: '0 0 12px 0',
  },
});

export function SidebarComponent() {
  const {
    connecting,
    network,
    wallet,
    walletDB,
    currentContractAddress,
    currentContractArtifact,
    drawerOpen,
    setDrawerOpen,
  } = useContext(AztecContext);

  const [isNetworkConnected, setIsNetworkConnected] = useState(false);
  const [walletAlias, setWalletAlias] = useState<string | undefined>(undefined);
  const [contractAlias, setContractAlias] = useState<string | undefined>(undefined);

  const [smallScreen, setSmallScreen] = useState(window.matchMedia('(max-width: 1200px)').matches);

  useEffect(() => {
    window.matchMedia('(max-width: 1200px)').addEventListener('change', e => setSmallScreen(e.matches));
  }, []);

  useEffect(() => {
    setDrawerOpen(!smallScreen);
  }, [smallScreen]);

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
      const alias = aliasedContracts.find(({ value }) =>
        currentContractAddress?.equals(AztecAddress.fromString(value)),
      );
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
    return `Account: ${walletAlias || formatFrAsString(wallet.getAddress().toString())}`;
  };

  const getContractButtonText = () => {
    if (!currentContractArtifact) return 'Select Contract';
    const name = currentContractArtifact.name;
    if (currentContractAddress) {
      return `Contract: ${contractAlias ?? name} (${formatFrAsString(currentContractAddress.toString())})`;
    } else {
      return name;
    }
  };

  return (
    <div css={[container, !drawerOpen && { height: '55px' }]}>
      <div css={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="overline">Tools</Typography>
        {smallScreen && (
          <IconButton sx={{ height: '24px', padding: 0, width: '24px' }} onClick={() => setDrawerOpen(!drawerOpen)}>
            <KeyboardArrowDownIcon css={[dropdownIcon, { margin: 0 }, drawerOpen && { transform: 'rotate(180deg)' }]} />
          </IconButton>
        )}
      </div>
      {drawerOpen && (
        <>
          <ButtonWithModal
            label="Select Network"
            isActive={activeSection === 'network'}
            isSelected={connecting || isNetworkConnected}
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
          <TxsPanel />
        </>
      )}
    </div>
  );
}
