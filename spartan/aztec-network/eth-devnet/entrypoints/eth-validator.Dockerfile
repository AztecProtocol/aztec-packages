FROM sigp/lighthouse:v6.0.1

COPY ./eth-validator.sh ./eth-validator.sh

ENTRYPOINT ["/eth-validator.sh"]
