import { css } from '@mui/styled-engine';
import { NetworkSelector } from './components/NetworkSelector';
import { AccountSelector } from './components/AccountSelector';
import { AddressBook } from './components/AddressBook';
import { ContractSelector } from './components/ContractSelector';

const container = css({
  display: 'flex',
  flexDirection: 'column',
  transition: 'all 0.3s ease-out',
  marginBottom: '2rem',
  '@media (max-width: 900px)': {
    width: '100%',
    marginBottom: '1rem',
  },
});

const navbarContent = css({
  display: 'flex',
  flexDirection: 'row-reverse',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: '10px',
  flexWrap: 'wrap',
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
        <AddressBook />
      </div>
    </div>
  );
}
