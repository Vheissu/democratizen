import nacl from 'tweetnacl';

export const base64 = bytes => {
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(text);
};
export function unbase64(text, length) {
  if (typeof text !== 'string' || text.length > 8388608 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error('Invalid encoding');
  const bytes = Uint8Array.from(atob(text), ch => ch.charCodeAt(0));
  if (length !== undefined && bytes.length !== length) throw new Error('Invalid key length');
  if (base64(bytes) !== text) throw new Error('Noncanonical encoding');
  return bytes;
}
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
export const encode = value => encoder.encode(JSON.stringify(value));
export const decode = bytes => JSON.parse(decoder.decode(bytes));

function nonce(prefix, sequence) {
  if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > 0xffffffff) throw new Error('Counter exhausted');
  const result = new Uint8Array(24);
  result.set(prefix);
  new DataView(result.buffer).setUint32(16, sequence, true);
  return result;
}

export function createCipher(key, txPrefix, rxPrefix) {
  let tx = 0;
  let rx = 0;
  return {
    seal(value) {
      const seq = tx++;
      return JSON.stringify({ seq, box: base64(nacl.secretbox(encode(value), nonce(txPrefix, seq), key)) });
    },
    open(packet) {
      const value = typeof packet === 'string' ? JSON.parse(packet) : packet;
      if (value.seq !== rx) throw new Error('Out-of-order packet');
      const result = nacl.secretbox.open(unbase64(value.box), nonce(rxPrefix, rx), key);
      if (!result) throw new Error('Authentication failed');
      const message = decode(result);
      rx++;
      return message;
    }
  };
}

export function authenticateClient(challenge, clientSecret, hostPublic) {
  const key = nacl.randomBytes(32);
  const clientPrefix = nacl.randomBytes(16);
  const serverPrefix = nacl.randomBytes(16);
  const authNonce = nacl.randomBytes(24);
  const payload = { challenge, key: base64(key), clientPrefix: base64(clientPrefix), serverPrefix: base64(serverPrefix) };
  return {
    packet: JSON.stringify({ type: 'auth', clientKey: base64(nacl.box.keyPair.fromSecretKey(clientSecret).publicKey), nonce: base64(authNonce), box: base64(nacl.box(encode(payload), authNonce, hostPublic, clientSecret)) }),
    cipher: createCipher(key, clientPrefix, serverPrefix)
  };
}

export function authenticateHost(packet, challenge, hostSecret, allowedClients) {
  if (packet.type !== 'auth' || !allowedClients.includes(packet.clientKey)) throw new Error('Unpaired client');
  const plain = nacl.box.open(unbase64(packet.box), unbase64(packet.nonce, 24), unbase64(packet.clientKey, 32), hostSecret);
  if (!plain) throw new Error('Invalid authentication');
  const value = decode(plain);
  if (value.challenge !== challenge) throw new Error('Stale challenge');
  return createCipher(unbase64(value.key, 32), unbase64(value.serverPrefix, 16), unbase64(value.clientPrefix, 16));
}
