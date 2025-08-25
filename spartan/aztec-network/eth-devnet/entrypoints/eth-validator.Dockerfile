FROM sigp/lighthouse:v7.1.0

COPY ./entrypoints/eth-validator.sh /eth-validator.sh

ENTRYPOINT ["/eth-validator.sh"]
