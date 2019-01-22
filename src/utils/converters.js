/*
/*
 * Convert binary string into an byte buffer.
 * @param {string} s - input string.
 * @return {Uint8Array} Byte buffer.
*/

export const s2b = s => {
  let b = new Uint8Array( s.length );
  for ( let i = 0; i < s.length; i++ ) {
    let c = s.charCodeAt( i );
    if ( c > 255 ) throw new Error( 'Wide characters are not allowed' );
    b[ i ] = c;
  }
  return b;
};

/*
 * Encode Unicode-string into an UTF8-encoded buffer.
 * @param {string} s - input string.
 * @return {Uint8Array} Byte buffer.
*/

export const u2b = s => {
  return s2b( decodeURIComponent( encodeURIComponent( s ) ) );
};

/*
 * Decode Base64 URL-safe string into a byte buffer.
 * @param {string} s - input Base64 URL-safe string.
 * @return {Uint8Array} Byte buffer.
*/

export const a2b = s => {
  s += '===';
  s = s.slice( 0, -s.length % 4 );
  return s2b( atob( s.replace( /-/g, '+' ).replace( /_/g, '/' ) ) );
};

/*
 * Parse HEX-string into a byte buffer.
 * @param {string} s - input HEX-string.
 * @return {Uint8Array} Byte buffer.
*/

export const x2b = s => {
  if ( s.length % 2 ) s = '0' + s;
  let b = new Uint8Array( s.length / 2 );
  for ( let i = 0; i < s.length; i += 2 ) b[ i >> 1 ] = parseInt( s.substr( i, 2 ), 16 );
  return b;
};

/*
 * Convert byte buffer into a binary string.
 * @param {(ArrayBuffer|Uint8Array)} ab - input binary buffer.
 * @return {string} Binary string.
*/

export const b2s = ab => {
  let b = ( ab instanceof ArrayBuffer ) ? new Uint8Array( ab ) : ab, s = '';
  for ( let i = 0; i < b.length; i++ ) s += String.fromCharCode( b[ i ] );
  return s;
};

/*
 * Decode UTF8-encoded byte buffer into an Unicode-string.
 * @param {(ArrayBuffer|Uint8Array)} ab - input binary buffer.
 * @return {string} Unicode string.
*/

export const b2u = ab => {
  return decodeURIComponent( escape( b2s( ab ) ) );
};

/*
 * Encode byte buffer into Base64 URL-safe string.
 * @param {(ArrayBuffer|Uint8Array)} ab - input binary buffer.
 * @return {string} Base64 URL-safe string.
*/

export const b2a = ab => {
  let b = ( ab instanceof ArrayBuffer ) ? new Uint8Array( ab ) : ab;
  return btoa( b2s( b ) ).replace( /=+$/, '' ).replace( /\+/g, '-' ).replace( /\//g, '_' );
};

/*
 * Encode byte buffer into a HEX-string.
 * @param {(ArrayBuffer|Uint8Array)} ab - input binary buffer.
 * @return {string} HEX string.
*/

export const b2x = ab => {
  let b = ( ab instanceof ArrayBuffer ) ? new Uint8Array( ab ) : ab, s = '';
  for ( let i = 0; i < b.length; i++ ) {
    let h = b[ i ].toString( 16 );
    if ( h.length < 2 ) s += '0';
    s += h;
  }
  return s;
};

/*
 * Like <code>window.btoa</code>, but encode into Base64 URL-safe format.
 * @param {string} s - input binary string.
 * @return {string} Base64 URL-safe string.
 * @see <code>window.btoa</code>
*/

export const u2a = s => {
  return btoa( decodeURIComponent( encodeURIComponent( s ) ) )
    .replace( /=+$/, '' ).replace( /\+/g, '-' ).replace( /\//g, '_' );
};

/*
 * Like <code>window.atob</code>, but decode from Base64 URL-safe format.
 * @param {string} s - input Base64 URL-safe string.
 * @return {string} binary string.
 * @see <code>window.atob</code>
*/

export const a2u = s => {
  s += '===';
  s = s.slice( 0, -s.length % 4 );
  return decodeURIComponent( escape( atob( s.replace( /-/g, '+' ).replace( /_/g, '/' ) ) ) );
};
