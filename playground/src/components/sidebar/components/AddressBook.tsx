import { useContext, useState } from 'react';
import { AddSendersDialog } from './AddSenderDialog';
import Button from '@mui/material/Button';
import ContactsIcon from '@mui/icons-material/Contacts';
import { AztecContext } from '../../../aztecEnv';
import type { AztecAddress } from '@aztec/aztec.js';

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
          <Button variant="contained" onClick={() => setOpenAddSendersDialog(true)} endIcon={<ContactsIcon />}>
            Contacts
          </Button>
          <AddSendersDialog open={openAddSendersDialog} onClose={handleSenderAdded} />
        </>
      )}
    </>
  );
}
