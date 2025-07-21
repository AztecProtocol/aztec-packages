import type { WalletWithMetadata } from "@aztec/aztec.js"
import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import { dialogBody } from "../../../styles/common";
import DialogContent from "@mui/material/DialogContent";
import { useEffect, useState } from "react";
import { AztecEnv } from "../../../aztecEnv";
import Box from "@mui/material/Box";
import { Typography } from "@mui/material";


function WalletTile({ wallet, onClick }: { wallet: WalletWithMetadata,onClick: (wallet: WalletWithMetadata) => void }) {
    return (
        <Box>
          <Typography variant="h4">{wallet.info.name}</Typography>
        </Box>
    );
}

type WalletSelectorProps ={
    open: boolean,
    onClose: (wallet?: WalletWithMetadata) => void,
}

export function WalletSelector({ onClose, open}: WalletSelectorProps) {

    const [wallets, setWallets] = useState<WalletWithMetadata[]>([]);

    useEffect(() => {
      const requestWallets = async () => {
        const wallets = await AztecEnv.requestWallets();
        setWallets(wallets);
      };
      requestWallets();
    }, []);

    return (
        <Dialog onClose={onClose} open={open}>
          <DialogTitle>Wallet selector</DialogTitle>
          <DialogContent sx={dialogBody}>
          { wallets.map(wallet => (<WalletTile key={wallet.info.uuid} wallet={wallet} onClick={() => onClose(wallet)} />)) }
          </DialogContent>
        </Dialog>
      );
}
