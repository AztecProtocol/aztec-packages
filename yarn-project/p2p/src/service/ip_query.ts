import * as https from 'https';

export function getPublicIp(): Promise<string> {
  return new Promise((resolve, reject) => {
    https
      .get('https://checkip.amazonaws.com', res => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          resolve(data.trim());
        });
      })
      .on('error', err => {
        reject(`Error fetching public IP: ${err.message}`);
      });
  });
}
