SPONSORED_FPC_ADDRESS=$(aztec \
  get-canonical-sponsored-fpc-address \
  | awk '{print $NF}')
SPONSORED_FPC_PAYMENT_METHOD="--payment method=fpc-sponsored,fpc=$SPONSORED_FPC_ADDRESS"
