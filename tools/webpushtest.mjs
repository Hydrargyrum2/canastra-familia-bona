// Test šifrování Web Push (RFC 8291) a podpisu VAPID: rozšifruje zprávu tak, jak by to udělal prohlížeč.
import { encrypt, generateVapid, b64u, unb64u, _test } from '../src/server/webpush.js';
const subtle = crypto.subtle;
const te = new TextEncoder();
let fails = 0;
const check = (c, l) => { console.log((c ? '  ✓ ' : '  ✗ ') + l); if (!c) fails++; };

// „prohlížeč“: klíče předplatného
const ua = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const uaPub = new Uint8Array(await subtle.exportKey('raw', ua.publicKey));
const auth = crypto.getRandomValues(new Uint8Array(16));
const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: b64u(uaPub), auth: b64u(auth) } };
const text = JSON.stringify({ title: 'Pozvánka', body: 'Filip tě zve ke stolu ABC123 – á č ř 🃏' });
const body = await encrypt(sub, text);

// rozšifrování podle RFC 8291
const salt = body.slice(0, 16);
const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
const idlen = body[20];
const asPub = body.slice(21, 21 + idlen);
const cipher = body.slice(21 + idlen);
const asKey = await subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
const { hmac, concat } = _test;
const prkKey = await hmac(auth, ecdh);
const ikm = await hmac(prkKey, concat(te.encode('WebPush: info\0'), uaPub, asPub, new Uint8Array([1])));
const prk = await hmac(salt, ikm);
const cek = (await hmac(prk, concat(te.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
const nonce = (await hmac(prk, concat(te.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
const aes = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, cipher));
check(rs === 4096 && idlen === 65, 'hlavička: rs 4096, klíč 65 B');
check(plain[plain.length - 1] === 2, 'oddělovač posledního záznamu 0x02');
check(new TextDecoder().decode(plain.slice(0, -1)) === text, 'zpráva se rozšifruje beze změny');

// VAPID
const vapid = await generateVapid();
const h = await _test.vapidHeader(sub.endpoint, vapid, 'mailto:faldik2033@seznam.cz');
const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h);
check(!!m && m[4] === vapid.publicKey, 'hlavička Authorization má tvar vapid t=…, k=…');
const claims = JSON.parse(new TextDecoder().decode(unb64u(m[2])));
check(claims.aud === 'https://fcm.googleapis.com' && claims.sub.startsWith('mailto:') && claims.exp > Date.now() / 1000, 'claims: aud, sub, exp');
const pub = await subtle.importKey('raw', unb64u(vapid.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, unb64u(m[3]), te.encode(m[1] + '.' + m[2]));
check(ok && unb64u(m[3]).length === 64, 'podpis ES256 (64 B) sedí s veřejným klíčem');
process.exit(fails ? 1 : 0);
