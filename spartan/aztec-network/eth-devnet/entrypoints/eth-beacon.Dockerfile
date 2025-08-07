FROM sigp/lighthouse:v7.1.0

COPY ./entrypoints/eth-beacon.sh /eth-beacon.sh

ENTRYPOINT ["./eth-beacon.sh"]
