import { useContext, useState } from 'react';
import { AddSendersDialog } from './AddSenderDialog';
import ContactsIcon from '@mui/icons-material/Contacts';
import { AztecContext } from '../../../aztecEnv';
import type { AztecAddress } from '@aztec/aztec.js';
import { navbarButtonStyle } from '../../../styles/common';
import { Typography } from '@mui/material';

export function AddressBook() {
  const [openAddSendersDialog, setOpenAddSendersDialog] = useState(false);

  const { wallet, walletDB, isPXEInitialized } = useContext(AztecContext);

  const handleSenderAdded = async (sender?: AztecAddress, alias?: string) => {
    if (sender && alias) {
      await wallet.registerSender(sender);
      await walletDB.storeAlias('senders', alias, Buffer.from(sender.toString()));
    }
    setOpenAddSendersDialog(false);
  };

  return (
    <>
      {wallet && walletDB && isPXEInitialized && (
        <>
          <div css={navbarButtonStyle} style={{ padding: '10px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'flex-start' }}
            role="button"
            onClick={() => setOpenAddSendersDialog(true)}
          >
            <ContactsIcon color='inherit' sx={{ marginRight: '12px' }} />
            <Typography variant="body1">Contacts</Typography>
          </div>
          {openAddSendersDialog && (
            <AddSendersDialog open={openAddSendersDialog} onClose={handleSenderAdded} />
          )}
        </>
      )}
    </>
  );
}
