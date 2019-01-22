import * as types from '../constants/actionTypes';
import Store from '../store';
import { getDomain, minimizeURL } from '../utils/tools';

export const allPasswordsDelete = () => ( {
  type: types.PASSWORDS_ALL_DELETE
} );

export const passwordChange = ( domain, params ) => {
  return {
    type: types.PASSWORD_ITEM_CHANGE,
    domain: domain,
    params: params
  };
};

export const passwordItemDelete = domain => {
  return {
    type: types.PASSWORD_ITEM_DELETE,
    domain: domain
  };
};

export const passwordItemAdd = ( domain, params ) => {
  return {
    type: types.PASSWORD_ITEM_ADD,
    domain: domain,
    params: params
  };
};

export const passwordsBatchChange = payload => {
  return {
    type: types.PASSWORD_ITEM_CHANGE_BATCH,
    params: payload
  };
};

export const passwordsSchemes = () => {
  let res = {},
    domain,
    state = Store.getState().passwords;
  for ( domain in state ) {
    if ( !state.hasOwnProperty( domain ) ) continue;
    res[ domain ] = state[ domain ].scheme || {};
  }
  return res;
};

export const syncronozeAcessDomainsPlugin = items => {
  let storedItems = Store.getState().passwords,
    found,
    toChange = {},
    newDomain,
    domain;
  for ( newDomain in items ) {
    if ( !items.hasOwnProperty( newDomain ) ) continue;
    found = false;
    for ( domain in storedItems ) {
      if ( !storedItems.hasOwnProperty( domain ) || domain !== newDomain ) continue;
      found = true;
      if ( !items[ newDomain ].time || storedItems[ domain ].scheme.time >= items[ newDomain ].time ) break;
      toChange[ domain ] = { scheme: { ...items[ newDomain ] } };
      break;
    }
    found || Store.dispatch( passwordItemAdd( newDomain, {
      scheme: { ...items[ newDomain ], ...{ time: items[ newDomain ].time || Date.now() / 1000 | 0 } }
    } ) );
  }
  Store.dispatch( passwordsBatchChange( toChange ) );
  storedItems = Store.getState().passwords;
  for ( domain in storedItems ) {
    if ( !storedItems.hasOwnProperty( domain ) ) continue;
    found = false;
    for ( newDomain in items ) {
      if ( !items.hasOwnProperty( newDomain ) ) continue;
      if ( domain !== newDomain ) continue;
      found = true;
      break;
    }
    found || Store.dispatch( passwordItemDelete( domain ) );
  }
};

export const pageShouldBeAnalized = url => {
  url = minimizeURL( url );
  let domain = getDomain( url, { noPrefix: true } ),
    storedItems = Store.getState().passwords;
  return (
    !storedItems[ domain ] ||
    !storedItems[ domain ].scheme.url ||
    storedItems[ domain ].scheme.url === url ||
    storedItems[ domain ].scheme.pIndex < 0
  );
};

export const getScheme = url => {
  let domain = getDomain( url, { rootDomain: true } ),
    storedItems = Store.getState().passwords;
  if ( !storedItems[ domain ] ) return false;
  return { ...storedItems[ domain ].scheme };
};

const validateSchemeRecords = scheme => {
  let key,
    j;
  for ( let i = 1; i < 4; i++ ) {
    if ( !scheme[ i ] ) continue;
    if ( !(
      ( typeof scheme[ i ].lIndex === 'number' || typeof scheme[ i ].pIndex === 'number' ) ||
      ( scheme[ i ].url && typeof scheme[ i ].url !== 'string' )
    ) ) return false;
    if ( scheme[ i ].checkboxes ) {
      if ( !( scheme[ i ].checkboxes instanceof Object ) ) return false;
      for ( j in scheme[ i ].checkboxes ) {
        if ( !scheme[ i ].checkboxes.hasOwnProperty( j ) ) continue;
        if (
          typeof j !== 'string' ||
          typeof scheme[ i ].checkboxes[ j ] !== 'boolean'
        ) return false;
      }
    }
    if ( scheme[ i ].selects ) {
      if ( !( scheme[ i ].selects instanceof Object ) ) return false;
      for ( j in scheme[ i ].selects ) {
        if ( !scheme[ i ].selects.hasOwnProperty( j ) ) continue;
        if (
          typeof j !== 'string' ||
          typeof scheme[ i ].selects[ j ] !== 'number'
        ) return false;
      }
    }
    if ( scheme[ i ].submit ) {
      if ( !( scheme[ i ].submit instanceof Object ) ) return false;
      key = Object.keys( scheme[ i ].submit )[ 0 ];
      if (
        typeof key !== 'string' ||
        typeof scheme[ i ].submit[ key ] !== 'number'
      ) return false;
    }
  }
  return typeof scheme.url === 'string';
};

export const copyScheme = scheme => {
  const validKeys = [ 'lIndex', 'pIndex', 'checkboxes', 'selects', 'submit' ];
  let result = {},
    i;
  for ( i = 1; i < 4; i++ ) {
    if ( scheme[ i ] ) {
      result[ i ] = {};
      Object.keys( scheme[ i ] ).forEach(
        key => validKeys.includes( key ) && ( result[ i ][ key ] = scheme[ i ][ key ] )
      );
    }
  }
  result.url = scheme.url;
  return result;
};

export const schemeChanged = scheme => {
  if ( !validateSchemeRecords( scheme ) ) return;
  const domain = getDomain( scheme.url, { rootDomain: true } ),
    storedItems = Store.getState().passwords,
    copiedScheme = copyScheme( scheme );
  copiedScheme.time = Date.now() / 1000 | 0;
  if ( storedItems[ domain ] ) {
    Store.dispatch( passwordChange( domain, { scheme: copiedScheme } ) );
  } else {
    Store.dispatch( passwordItemAdd( domain, { scheme: copiedScheme } ) );
  }
};
