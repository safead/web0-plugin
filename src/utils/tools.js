import * as constants from '../constants/common';

export const concatBuffers = buffers => {
  let tmp, shift = 0, summaryLength = 0, i;
  for ( i = 0; i < buffers.length; i++ ) summaryLength += buffers[ i ].byteLength;
  tmp = new Uint8Array( summaryLength );
  for ( let i = 0; i < buffers.length; i++ ) {
    shift += i ? buffers[ i - 1 ].byteLength : 0;
    tmp.set( new Uint8Array( buffers[ i ] ), shift );
  }
  return tmp.buffer;
};

export const secondsToTime = secs => {
  secs = Math.round( secs );
  let hours = Math.floor( secs / ( 60 * 60 ) ),
    deviderForMinutes = secs % ( 60 * 60 ),
    minutes = Math.floor( deviderForMinutes / 60 ),
    deviderForSeconds = deviderForMinutes % 60,
    seconds = Math.ceil( deviderForSeconds );
  hours < 10 && ( hours = '0' + hours );
  minutes < 10 && ( minutes = '0' + minutes );
  seconds < 10 && ( seconds = '0' + seconds );
  return hours + ':' + minutes + ':' + seconds;
};

export const equalAB = ( buf1, buf2 ) => {
  if ( buf1.byteLength !== buf2.byteLength ) return false;
  let dv1 = new Int8Array( buf1 ), dv2 = new Int8Array( buf2 ), i;
  for ( i = 0; i < buf1.byteLength; i++ ) if ( dv1[ i ] !== dv2[ i ] ) return false;
  return true;
};

export const removeTrailing = ( str, pattern ) => {
  if ( !str.length ) return '';
  const pos = str.indexOf( pattern );
  pos >= 0 && ( str = str.substr( 0, pos ) );
  return str;
};

export const removeIfLast = str => {
  if ( !str.length ) return '';
  while ( str.endsWith( '/' ) ) str = str.substr( 0, str.length - 1 );
  return str;
};

const removePrefix = domain => {
  if ( !domain ) return '';
  while ( domain.startsWith( 'www.' ) ) domain = domain.substr( 4, domain.length );
  return domain;
};

const getRootDomain = domain => {
  if ( !domain ) return '';
  let temp = domain.split( '.' );
  if ( temp.length < 2 ) return domain;
  domain = temp.pop();
  return temp.pop() + '.' + domain;
};

export const getDomain = ( url, params = {} ) => {
  if ( !url ) return '';
  let match = url.match( /:\/\/([^/?]+)($|[/?]).*/ );
  let result = ( match && match.length > 0 ? match[ 1 ] : '' ).toLowerCase();
  return params.noPrefix ? removePrefix( result ) : params.rootDomain ? getRootDomain( result ) : result;
};

export const minimizeURL = url => {
  if ( !url ) return '';
  url = removeTrailing( url, '#' );
  url = removeTrailing( url, '?' );
  url = removeIfLast( url, '/' );
  return url;
};

export const copyText = input => {
  logError( '[copyText]', input );
  document.activeElement && document.activeElement.blur();
  const el = document.createElement( 'textarea' );
  el.value = input;
  el.setAttribute( 'readonly', '' );
  el.style.contain = 'strict';
  el.style.position = 'absolute';
  el.style.left = '-9999px';
  el.style.fontSize = '12pt';
  const selection = document.getSelection();
  let originalRange = false,
    success = false;
  selection.rangeCount > 0 && ( originalRange = selection.getRangeAt( 0 ) );
  document.body.appendChild( el );
  el.select();
  el.selectionStart = 0;
  el.selectionEnd = input.length;
  try {
    success = document.execCommand( 'copy' );
  } catch ( ex ) {}
  document.body.removeChild( el );
  if ( originalRange ) {
    selection.removeAllRanges();
    selection.addRange( originalRange );
  }
  return success;
};

export const logError = ( ...args ) => {
  constants.DEBUG && typeof ( console ) !== 'undefined' && console.error( ...args );
};

export const log = ( ...args ) => {
  constants.DEBUG && typeof ( console ) !== 'undefined' && console.log( ...args );
};

export const logWarn = ( ...args ) => {
  constants.DEBUG && typeof ( console ) !== 'undefined' && console.warn( ...args );
};
