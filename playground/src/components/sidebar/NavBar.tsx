import { css } from '@mui/styled-engine';
import { AztecContext } from '../../aztecEnv';
import { AztecAddress } from '@aztec/aztec.js';
import { useContext, useEffect, useState } from 'react';
import { NetworkSelector } from './components/NetworkSelector';
import { AccountSelector } from './components/AccountSelector';
import { AddressBook } from './components/AddressBook';
import { ContractSelector } from './components/ContractSelector';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { IconButton } from '@mui/material';
import { dropdownIcon } from '../../styles/common';

const container = css({
  overflow: 'auto',
  flexShrink: 0,

  padding: '0 60px',
  flexGrow: 0,
  borderRadius: '10px',
  display: 'flex',
  flexDirection: 'column',
  transition: 'all 0.3s ease-out',
  scrollbarWidth: 'none',
  '@media (max-width: 1200px)': {
    padding: '12px',
    width: 'auto',
    maxHeight: '350px',
    margin: '0 0 12px 0',
  },
});

const navbarContent = css({
  display: 'flex',
  flexDirection: 'row-reverse',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '10px',
});

export function NavBar() {
  const {
    drawerOpen,
    setDrawerOpen,
  } = useContext(AztecContext);

  const [smallScreen, setSmallScreen] = useState(window.matchMedia('(max-width: 1200px)').matches);

  useEffect(() => {
    window.matchMedia('(max-width: 1200px)').addEventListener('change', e => setSmallScreen(e.matches));
  }, []);

  useEffect(() => {
    setDrawerOpen(!smallScreen);
  }, [smallScreen]);

  return (
    <div css={[container]}>
      <div css={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {smallScreen && (
          <IconButton sx={{ height: '24px', padding: 0, width: '24px' }} onClick={() => setDrawerOpen(!drawerOpen)}>
            <KeyboardArrowDownIcon css={[dropdownIcon, { margin: 0 }, drawerOpen && { transform: 'rotate(180deg)' }]} />
          </IconButton>
        )}
      </div>
      {drawerOpen && (
        <div css={navbarContent}>
          <NetworkSelector />
          <AccountSelector />
          <ContractSelector />
          <div css={{ flex: '1 0 auto', margin: 'auto' }} />
          <AddressBook />
        </div>
      )}
    </div>
  );
}
