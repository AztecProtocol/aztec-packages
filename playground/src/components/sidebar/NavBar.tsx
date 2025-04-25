import { css } from '@mui/styled-engine';
import { NetworkSelector } from './components/NetworkSelector';
import { AccountSelector } from './components/AccountSelector';
import { AddressBook } from './components/AddressBook';
import { ContractSelector } from './components/ContractSelector';

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
  '@media (max-width: 900px)': {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
});

export function NavBar() {
  return (
    <div css={[container]}>
      <div css={navbarContent}>
        <NetworkSelector />
        <AccountSelector />
        <ContractSelector />
        <div css={{ flex: '1 0 auto', margin: 'auto' }} />
        <AddressBook />
      </div>
    </div>
  );
}
