const crypto = require('crypto');

async function generateKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });

  const pubJwk = publicKey.export({ format: 'jwk' });
  const privJwk = privateKey.export({ format: 'jwk' });

  console.log(JSON.stringify({ pubJwk, privJwk }));
}

generateKeys();
