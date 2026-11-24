// Cria a chave de assinatura do APK (PKCS12) uma única vez.
// Guarde o arquivo gerado (keys/perfumolandia.p12) e a senha: sem eles não dá para lançar atualizações do APK.
import forge from 'node-forge';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const dir = path.join(import.meta.dirname, '..', 'keys');
const file = path.join(dir, 'perfumolandia.p12');
if (fs.existsSync(file)) { console.log('Chave já existe:', file); process.exit(0); }
fs.mkdirSync(dir, { recursive: true });

const password = crypto.randomBytes(18).toString('base64url');
const keys = forge.pki.rsa.generateKeyPair(2048);
const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = '01' + crypto.randomBytes(8).toString('hex');
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date(Date.now() + 30 * 365 * 24 * 3600 * 1000);
const attrs = [{ name: 'commonName', value: 'Perfumolandia' }, { name: 'organizationName', value: 'Perfumolandia' }, { name: 'countryName', value: 'BR' }];
cert.setSubject(attrs);
cert.setIssuer(attrs);
cert.sign(keys.privateKey, forge.md.sha256.create());
const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: '3des', friendlyName: 'perfumolandia' });
fs.writeFileSync(file, Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary'));
fs.writeFileSync(path.join(dir, 'senha.txt'), password + '\n');
console.log('Chave criada em', file);
