import { u2b, b2x, s2b, a2b } from './converters';

const EARGS = 'Illegal arguments',
  ENC = {
    ext: false,
    use: [
      'encrypt',
      'decrypt'
    ],
    alg: {
      name: 'AES-GCM',
      length: 256,
      tagLength: 32
    }
  };

export const sha512 = seed => {
  return crypto.subtle.digest( 'SHA-512', seed );
};

export const sha256 = seed => {
  return crypto.subtle.digest( 'SHA-256', seed );
};

export const sha256x = async seed => {
  return b2x( new Uint8Array( await sha256( seed ) ) );
};

export const sha256blockchain = async value => {
  return '0x' + await sha256x( u2b( value ) );
};

export const generateKeyAES = seed => {
  return crypto.subtle.importKey( 'raw', seed, ENC.alg, ENC.ext, ENC.use );
};

export const Signing = keyHMAC => {
  if ( ( !keyHMAC || !( keyHMAC instanceof Object ) ) ) throw new SyntaxError( EARGS );
  this.keyHMAC = keyHMAC;
};

Signing.prototype.sign = async data => {
  return crypto.subtle.sign( 'HMAC', this.keyHMAC, data );
};

const KEY_ROLES = {
  'ENC': {
    ext: true,
    use: [
      'encrypt',
      'decrypt'
    ],
    alg: {
      'name': 'RSA-OAEP',
      'hash': 'SHA-1',
      'modulusLength': 2048,
      'publicExponent': new Uint8Array( [ 1, 0, 1 ] )
    },
    toString: () => { return 'ENC'; }
  },
  'SIGN': {
    ext: true,
    use: [
      'verify',
      'sign'
    ],
    alg: {
      'name': 'RSASSA-PKCS1-v1_5',
      'hash': 'SHA-256',
      'modulusLength': 2048,
      'publicExponent': new Uint8Array( [ 1, 0, 1 ] )
    },
    toString: () => { return 'SIGN'; }
  }
};

export const randomBuffer = length => {
  return crypto.getRandomValues( new Uint8Array( length ) );
};

export const hmac256FromSeed = async ( seed, data ) => {
  let keyHMAC = await crypto.subtle
    .importKey( 'raw', seed, { name: 'HMAC', hash: { name: 'SHA-256' } }, false, [ 'sign' ] );
  return {
    hash: await crypto.subtle.sign( 'HMAC', keyHMAC, data ),
    seed: seed
  };
};

/*
 * Import public key from OpenSSL-compatible PEM container.
 * @param {string} role - role of the key being exported
 * @param {string} keyData - PEM-encoded public key
 * @return {Promise<CryptoKey>} Promise for imported key.
*/

export const importPublicKey = async ( role, keyData ) => {
  let keyRole = KEY_ROLES[ role ];
  if ( !keyRole ) throw new Error( 'Bad keyRole' );
  if ( typeof keyData !== 'string' ) throw new TypeError( 'Malformed keyData' );
  keyData = s2b( atob( keyData.replace( /-(-)*\s?BEGIN\s+PUBLIC\s+KEY\s*-(-)*\r?\n/, '' )
    .replace( /-(-)*\s?END\s+PUBLIC\s+KEY\s*-(-)*\r?\n?/, '' )
    .replace( /\s/g, '' ).replace( /\r?\n/g, '' ) ) );
  return crypto.subtle.importKey( 'spki', keyData, keyRole.alg, keyRole.ext, [ keyRole.use[ 0 ] ] );
};

export const RSAEncrypt = ( key, data ) => {
  return window.crypto.subtle.encrypt( KEY_ROLES.ENC.alg, key, data );
};

export const RSAVerify = ( key, signature, data ) => {
  return crypto.subtle.verify( KEY_ROLES.SIGN.alg, key, signature, data );
};

export class Ciphering {

  constructor( encKey ) {
    if ( ( !encKey || !( encKey instanceof Object ) ) ) throw new SyntaxError( EARGS );
    this.encKey = encKey;
  }

  async encipher( data ) {
    typeof data === 'string' && ( data = u2b( data ) );
    data instanceof Uint8Array && ( data = data.buffer );
    if ( !( data instanceof ArrayBuffer ) ) throw new SyntaxError( EARGS );
    let iv = crypto.getRandomValues( new Uint8Array( 12 ) ), encoded = '';
    try {
      encoded = await crypto.subtle.encrypt(
        { 'iv': iv, ...ENC.alg }, this.encKey, data
      );
    } catch ( ex ) {}
    return {
      iv: iv,
      encoded: encoded
    };
  };

  async decipher( iv, data ) {
    typeof data === 'string' && ( data = a2b( data ) );
    data instanceof Uint8Array && ( data = data.buffer );
    iv instanceof Array && ( iv = new Uint8Array( iv ) );
    iv instanceof Uint8Array && ( iv = iv.buffer );
    if ( !( data instanceof ArrayBuffer ) || !( iv instanceof ArrayBuffer ) ) throw new SyntaxError( EARGS );
    let decoded;
    try {
      decoded = await crypto.subtle.decrypt( { 'iv': iv, ...ENC.alg }, this.encKey, data );
    } catch ( ex ) {}
    return decoded || new Uint8Array( 0 );
  }

}
