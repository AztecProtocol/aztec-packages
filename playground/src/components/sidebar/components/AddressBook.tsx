import { useContext, useState } from 'react';
import { AddSendersDialog } from './AddSenderDialog';
import ContactsIcon from '@mui/icons-material/Contacts';
import { AztecContext } from '../../../aztecEnv';
import type { AztecAddress } from '@aztec/aztec.js';
import { navbarButtonStyle } from '../../../styles/common';
import { IconButton, Tooltip } from '@mui/material';

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
          <div css={navbarButtonStyle} style={{ padding: '10px' }}>
            <Tooltip title="Add Contacts">
              <IconButton onClick={() => setOpenAddSendersDialog(true)}>
                <ContactsIcon color='inherit' />
              </IconButton>
            </Tooltip>
            {openAddSendersDialog && <AddSendersDialog open={openAddSendersDialog} onClose={handleSenderAdded} />}
          </div>
        </>
      )}
    </>
  );
}
