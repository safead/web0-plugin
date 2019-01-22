'use strict';
import '@babel/polyfill';
import Store, { action } from '../store';
import * as types from '../constants/actionTypes';
import { Web0AuthSession } from '../classes/authSession';
import { getDomain } from '../utils/tools';
import { extension } from '../classes/extension';
import * as constants from '../constants/common';
export const WINDOW_ID_NONE = extension ? extension.windows.WINDOW_ID_NONE : -1;

extension.webNavigation.onDOMContentLoaded.addListener( details => {
  if ( !details.url.match( /^http/ ) ) return;
  frameUrlChanged( details.tabId, details.frameId, details.url ) && pageLoaded( details );
} );

extension.webNavigation.onHistoryStateUpdated.addListener( details => {
  frameUrlChanged( details.tabId, details.frameId, details.url ) && pageLoaded( details );
} );

const pageLoaded = async details => {
  await injectScriptInFrame( details );
};

const injectScriptInFrame = details => {
  return new Promise( res => {
    extension.tabs.sendMessage( details.tabId, { id: 'checkLoaded' }, { frameId: details.frameId }, result => {
      if ( result ) return res( true );
      return extension.tabs.executeScript( details.tabId, {
        frameId: details.frameId,
        matchAboutBlank: true,
        file: '/content/content.js'
      }, () => {
        return res( !extension.runtime.lastError );
      } );
    } );
  } );
};

const tabReloaded = tabId => {
  let rootUrl = Store.getState().frameRealUrl[ tabId ];
  rootUrl && Web0AuthSession.onLogout( rootUrl[ 0 ] );
  action( types.PROCESSING_TABS_DELETE, tabId );
  action( types.FRAME_REAL_URL_DELETE, tabId );
};

const queryTab = ( filter, allTabs = false ) => {
  return new Promise( res => {
    extension.tabs.query( filter, tabs => {
      res( tabs && tabs.length ? ( allTabs ? tabs : tabs[ 0 ] ) : null );
    } );
  } );
};

extension.tabs.onRemoved.addListener( tabId => {
  tabReloaded( tabId );
} );

extension.tabs.onReplaced.addListener( tabId => {
  tabReloaded( tabId );
} );

extension.tabs.onActiveChanged.addListener( tabId => {
  action( types.ACTIVE_TAB_CHANGE, tabId );
} );

extension.windows.onFocusChanged.addListener( async details => {
  if ( details === WINDOW_ID_NONE ) return;
  await checkCurrentActiveTab();
} );

extension.runtime.onInstalled.addListener( async () => {
  await checkCurrentActiveTab();
  const tabs = await queryTab( {}, true );
  if ( !tabs ) return;
  tabs.forEach( tab => {
    extension.tabs.reload( tab.id );
  } );
} );

extension.webRequest.onBeforeRequest.addListener( details => {
  if (
    details.method !== 'POST' ||
    details.tabId <= 0
  ) return;
  let state = Store.getState(),
    currentActiveTabId = state.currentActiveTabId,
    loginChainUrl = state.loginChain[ details.tabId ],
    rootUrl = state.frameRealUrl[ details.tabId ];
  if ( details.tabId !== currentActiveTabId ) return;
  if (
    loginChainUrl &&
    !details.frameId &&
    details.initiator &&
    details.type === 'main_frame' &&
    getDomain( details.initiator, { rootDomain: true } ) ===
    getDomain( loginChainUrl, { rootDomain: true } )
  ) {
    action( types.LOGIN_CHAIN_ADD, { tabId: details.tabId, url: details.url } );
  }
  if (
    state.processingTabs[ details.tabId ] ||
    Web0AuthSession.isLoggedIn( details.initiator ) ||
    !rootUrl
  ) return;
  if (
    details.initiator &&
    getDomain( details.initiator, { rootDomain: true } ) !== getDomain( rootUrl[ 0 ], { rootDomain: true } )
  ) return;
  extension.tabs.sendMessage(
    details.tabId,
    { id: 'checkFormSubmit', frameId: details.frameId },
    { frameId: details.frameId },
    response => {
      if (
        response instanceof Object &&
        response.scheme
      ) return newCredentials( details.tabId, details.frameId, response.scheme );
      details.frameId && extension.tabs.sendMessage( details.tabId, { id: 'checkFormSubmit', frameId: details.frameId },
        response => {
          response instanceof Object &&
          response.scheme &&
          newCredentials( details.tabId, details.frameId, response.scheme );
        } );
      return true;
    } );
}, { urls: [ '<all_urls>' ], types: [
  'main_frame',
  'sub_frame',
  'script',
  'xmlhttprequest',
  'websocket'
] }, [ 'requestBody' ] );

const newCredentials = async ( tabId, frameId, scheme ) => {
  let frameUrlObject = Store.getState().frameRealUrl[ tabId ],
    domain = getDomain( frameUrlObject[ 0 ], { rootDomain: true } ),
    preSchemes = Store.getState().preSchemes;
  scheme.url = frameUrlObject[ 0 ];
  if ( scheme[ 1 ] && !scheme[ 2 ] && !scheme[ 3 ] ) {
    return action( types.PRE_SCHEMES_ADD, { domain: domain, scheme: scheme } );
  } else if ( !scheme[ 1 ] ) {
    if ( scheme[ 2 ] && !preSchemes[ domain ] ) {
      return action( types.PRE_SCHEMES_DELETE, domain );
    } else if (
      scheme[ 3 ] &&
      preSchemes[ domain ] &&
      preSchemes[ domain ].login === scheme.login
    ) {
      delete scheme[ 3 ].lIndex;
      scheme[ 2 ] = { ...scheme[ 3 ] };
      delete scheme[ 3 ];
      scheme = { ...scheme, ...preSchemes[ domain ] };
    } else if (
      scheme[ 3 ] &&
      !scheme.password
    ) {
      delete scheme[ 3 ].pIndex;
      delete scheme.password;
      scheme[ 1 ] = { ...scheme[ 3 ] };
      delete scheme[ 3 ];
      return action( types.PRE_SCHEMES_ADD, { domain: domain, scheme: scheme } );
    } else if ( scheme[ 2 ] ) {
      scheme = { ...scheme, ...preSchemes[ domain ] };
    }
    action( types.PRE_SCHEMES_DELETE, domain );
  }
  if ( !scheme.login || !scheme.password ) return false;
  Web0AuthSession.onLogin( frameUrlObject[ 0 ], frameUrlObject[ frameId ], scheme.login );
  return action( types.NEW_CREDENTIALS, scheme );
};

const frameUrlChanged = ( tabId, frameId, newUrl ) => {
  action( types.FRAME_REAL_URL_ADD, {
    tabId: tabId,
    frameId: frameId,
    url: newUrl
  } );
  let state = Store.getState(),
    rootUrl = state.frameRealUrl[ tabId ],
    loginChainUrl = state.loginChain[ tabId ];
  if ( frameId ) {
    loginChainUrl &&
    Web0AuthSession.isLoggedIn( rootUrl[ 0 ] ) &&
    Web0AuthSession.onLogin( rootUrl[ 0 ], rootUrl[ frameId ] );
  } else startLoginChain( tabId, rootUrl[ 0 ] );
  return true;
};

const startLoginChain = ( tabId, url, login ) => {
  let loginChainUrl = Store.getState().loginChain[ tabId ];
  if ( !loginChainUrl ) return false;
  setTimeout( () => {
    if (
      loginChainUrl &&
      getDomain( loginChainUrl, { rootDomain: true } ) !== getDomain( url, { rootDomain: true } )
    ) {
      return Web0AuthSession.onLogin( url, loginChainUrl, login );
    }
    return action( types.LOGIN_CHAIN_DELETE, tabId );
  }, constants.LOGIN_CHAIN_TIMEOUT );
  return true;
};

const checkCurrentActiveTab = async () => {
  const tab = await queryTab( { active: true, currentWindow: true } );
  action( types.ACTIVE_TAB_CHANGE, tab && tab.url.match( /^http/ ) ? tab.id : null );
};

const createPopupMenu = ( msg = {} ) => {
  extension.contextMenus.removeAll( () => {
    extension.contextMenus.create( {
      'id': constants.PM_SELECTION,
      'title': 'Encrypt with web0',
      'contexts': [ 'selection' ]
    } );
    if ( msg.haveTextInInput && msg.isPasswordInput ) {
      extension.contextMenus.create( {
        'id': constants.PM_UPDATE_CREDENTIALS,
        'title': 'Send to mobile',
        'contexts': [ 'editable' ]
      } );
    } else {
      extension.contextMenus.create( {
        'id': constants.PM_AUTH,
        'title': 'Automated login',
        'contexts': [ 'editable' ]
      } );
      if ( msg.isPasswordInput ) {
        extension.contextMenus.create( {
          'id': constants.PM_CURRENT_PASSWORD,
          'title': 'Current password',
          'contexts': [ 'editable' ]
        } );
        extension.contextMenus.create( {
          'id': constants.PM_NEW_PASSWORD,
          'title': 'Create new password',
          'contexts': [ 'editable' ]
        } );
      }
    }
  } );
};

createPopupMenu();

extension.contextMenus.onClicked.addListener( async e => {
  const tab = await queryTab( { active: true, currentWindow: true } );
  switch ( e.menuItemId ) {
    case constants.PM_AUTH:
      return autoLogin( tab, e.frameId );
    case constants.PM_UPDATE_CREDENTIALS:
      return updateCredentials( tab.id, e.frameId );
    case constants.PM_CURRENT_PASSWORD:
      return currentPassword( tab.url, tab.id, e.frameId );
    case constants.PM_NEW_PASSWORD:
      return createPassword( tab.id, e.frameId );
  }
  return false;
} );

const currentPassword = async ( url, tabId, frameId ) => {
  action( types.AUTO_LOGIN, {
    justPassword: true,
    pageInfo: {
      tabUrl: url,
      tabId: tabId,
      frameId: frameId
    }
  } );
};

const createPassword = async ( tabId, frameId ) => {
  const state = Store.getState(),
    rootUrl = state.frameRealUrl[ tabId ];
  return action( types.CREATE_PASSWORD, {
    url: rootUrl[ 0 ],
    login: Web0AuthSession.isLoggedIn( rootUrl[ 0 ] ),
    tabId: tabId,
    frameId: frameId
  } );
};

const updateCredentials = async ( tabId, frameId ) => {
  extension.tabs.sendMessage( tabId, { id: 'checkFormSubmit', frameId: frameId, getCredentials: true }, response => {
    response instanceof Object && response.scheme && newCredentials( tabId, frameId, response.scheme );
  } );
};

const autoLogin = async ( tab, frameId ) => {
  const rootUrl = Store.getState().frameRealUrl[ tab.id ][ 0 ];
  Web0AuthSession.onLogout( tab.url );
  action( types.SCHEME_CANCEL + tab.id );
  if ( !rootUrl ) return;
  if ( !( await injectScriptInFrame( {
    tabId: tab.id,
    frameId: frameId,
    url: tab.url
  } ) ) ) return;
  resetTabState( tab.id, frameId );
  let scheme;
  if ( !( scheme = await Web0AuthSession.createScheme( tab.id, frameId ) ) ) return;
  action( types.AUTO_LOGIN, {
    scheme: scheme,
    pageInfo: {
      tabUrl: tab.url,
      tabId: tab.id,
      frameId: frameId
    }
  } );
};

extension.runtime.onMessage.addListener( ( msg, sender ) => {
  switch ( msg.id ) {
    case 'updateMenuItem':
      createPopupMenu( msg, sender.url );
      return;
    case 'schemeUpdate':
      action( types.UPDATE_SCHEME, msg.scheme );
      return;
    case 'terminateSession':
      Web0AuthSession.close();
      return;
    case 'showMessage':
      showMessageOnTab( msg.tabId, msg.text );
      return;
  }
} );

extension.browserAction.onClicked.addListener( () => {
  Web0AuthSession.connected() ? Web0AuthSession.close() : action( types.START_SESSION );
} );

const showMessageOnTab = ( tabId, text ) => {
  extension.tabs.sendMessage( tabId, { id: 'message', text: text }, { frameId: 0 } );
};

const resetTabState = async ( tabId, frameId ) => {
  extension.tabs.sendMessage( tabId, { id: 'resetState' }, { frameId: frameId } );
};

extension.webNavigation.onCommitted.addListener( details => {
  if ( ![
    'typed',
    'auto_bookmark',
    'generated',
    'reload'
  ].includes( details.transitionType ) ) return;
  action( types.SCHEME_CANCEL + details.tabId );
  action( types.FRAME_REAL_URL_DELETE, details.tabId );
} );
