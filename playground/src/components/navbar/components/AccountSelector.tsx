import { useState, useEffect, useContext } from 'react';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { CopyToClipboardButton } from '../../common/CopyToClipboardButton';
import { AztecAddress, type Aliased } from '@aztec/aztec.js';
import { formatFrAsString } from '../../../utils/conversion';
import { AztecContext } from '../../../aztecContext';
import { navbarButtonStyle, navbarSelect, navbarSelectLabel } from '../../../styles/common';
import SwitchAccountIcon from '@mui/icons-material/SwitchAccount';
import { trackButtonClick } from '../../../utils/matomo';

export function AccountSelector() {
  const { setFrom, wallet, from, currentTx } = useContext(AztecContext);

  const [areAccountsLoading, setAreAccountsLoading] = useState(false);
  const [accounts, setAccounts] = useState<Aliased<AztecAddress>[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const refreshAccounts = async () => {
      setAreAccountsLoading(true);
      if (currentTx?.name === 'Deploy account contract') {
        return;
      }
      const accounts = await wallet.getAccounts();
      setAccounts(accounts);
      setAreAccountsLoading(false);
    };

    if (wallet) {
      refreshAccounts();
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [wallet, currentTx]);

  // If there is only one account, select it automatically
  useEffect(() => {
    if (!areAccountsLoading && !wallet && accounts?.length === 1) {
      handleAccountChange(accounts[0].item);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, wallet, areAccountsLoading]);

  const handleAccountChange = async (address: AztecAddress) => {
    trackButtonClick(`Select Account`, 'Account Selector');
    setFrom(address);
  };

  if (areAccountsLoading) {
    return (
      <div css={navbarButtonStyle}>
        <CircularProgress size={24} color="primary" sx={{ marginRight: '1rem' }} />
        <Typography variant="body1">Loading account...</Typography>
      </div>
    );
  }

  return (
    <div css={navbarButtonStyle}>
      <SwitchAccountIcon />

      <FormControl css={navbarSelect}>
        {!from?.toString() && <InputLabel id="account-label">Select Account</InputLabel>}

        <Select
          fullWidth
          value={from?.toString() ?? ''}
          label="Account"
          open={isOpen}
          onOpen={() => setIsOpen(true)}
          onClose={() => setIsOpen(false)}
          onChange={e => {
            if (e.target.value !== '') {
              handleAccountChange(AztecAddress.fromString(e.target.value));
            }
          }}
          disabled={areAccountsLoading}
          renderValue={selected => {
            const account = accounts.find(account => account.item.toString() === selected);
            if (account) {
              return `${account?.alias.split(':')[1]} (${formatFrAsString(account?.item.toString())})`;
            }
            return selected ?? 'Select Account';
          }}
        >
          {!wallet && (
            <div css={navbarSelectLabel}>
              <Typography variant="body2" color="warning.main">
                Note: Connect to a network first to create and use accounts
              </Typography>
            </div>
          )}

          {accounts.length === 0 && (
            <div css={navbarSelectLabel}>
              <Typography variant="body2" color="warning.main">
                Note: Use your wallet to create an account
              </Typography>
            </div>
          )}

          {accounts.map(account => (
            <MenuItem key={account.alias} value={account.item.toString()}>
              {account.alias.split(':')[1]}&nbsp;(
              {formatFrAsString(account.item.toString())})
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {!areAccountsLoading && wallet && <CopyToClipboardButton disabled={!wallet} data={from?.toString()} />}
    </div>
  );
}
