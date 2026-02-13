FROM python:3.12

# Install aws cli.
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o "awscliv2.zip" && \
    unzip awscliv2.zip && \
    ./aws/install --bin-dir /usr/local/bin --install-dir /usr/local/aws-cli --update && \
    rm -rf aws awscliv2.zip

# Install redis cli.
RUN apt update && apt install -y \
      jq \
      netcat-openbsd \
      redis-tools \
      && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

WORKDIR /app
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt gunicorn
RUN git config --global --add safe.directory /aztec-packages
COPY . .
EXPOSE 8080
CMD ["gunicorn", "-w", "100", "-b", "0.0.0.0:8080", "rk:app"]
