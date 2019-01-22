import { select, put, call, race, take, fork } from 'redux-saga/effects';
import { delay } from 'redux-saga';
import { getScheme } from '../actions/passwords';
import { waitPeerConnection } from './main';
import { Web0AuthSession } from '../classes/authSession';
import * as constants from '../constants/common';
import * as types from '../constants/actionTypes';
import { extension } from '../classes/extension';

export function * autoLogin( action ) {
  const pageInfo = action.payload.pageInfo;
  try {
    yield race( [
      call( autoLoginFlow, action ),
      take( types.SCHEME_CANCEL + pageInfo.tabId ),
      call( delay, constants.AUTO_LOGIN_TIMEOUT )
    ] );
  } finally {
    yield put( { type: types.PROCESSING_TABS_DELETE, payload: pageInfo.tabId } );
  }
  return true;
}

export function * autoLoginFlow( action ) {
  const tabFrames = yield select( state => state.frameRealUrl ),
    pageInfo = action.payload.pageInfo;
  if (
    !action.payload.justPassword &&
    Web0AuthSession.isLoggedIn( tabFrames[ pageInfo.tabId ][ 0 ] )
  ) return;
  if ( !( yield waitPeerConnection() ) ) return;
  let credentials = ( yield select( state => state.processingTabs ) )[ pageInfo.tabId ];
  if ( !credentials ) {
    credentials = yield Web0AuthSession.requestAccessInfo( pageInfo.tabUrl, action.payload.scheme );
    if ( !credentials ) {
      extension.tabs.sendMessage(
        pageInfo.tabId,
        { id: 'message', text: 'No passwords for this domain' },
        { frameId: 0 }
      );
      return;
    }
  }
  yield put( { type: types.PROCESSING_TABS_ADD, payload: { tabId: pageInfo.tabId, scheme: credentials } } );
  const storedScheme = getScheme( pageInfo.tabUrl );
  if ( !storedScheme ) return;
  if ( action.payload.justPassword ) {
    extension.tabs.sendMessage(
      pageInfo.tabId,
      { id: 'password', value: credentials.password },
      { frameId: pageInfo.frameId }
    );
    return;
  }
  action.payload.scheme = { ...storedScheme, login: credentials.login, password: credentials.password };
  const pageResponse = yield Web0AuthSession.fillScheme( pageInfo.tabId, pageInfo.frameId, action.payload.scheme );
  switch ( pageResponse.result ) {
    case constants.SCHEME_NOT_EXISTS:
    case constants.SCHEME_NOT_FOUND:
      return;
    case constants.SCHEME_AUTOSUBMIT_DONE:
      yield put( { type: types.PROCESSING_TABS_DELETE, payload: pageInfo.tabId } );
      yield put( { type: types.LOGIN_CHAIN_ADD, payload: {
        tabId: pageInfo.tabId, url: tabFrames[ pageInfo.tabId ][ 0 ] }
      } );
      Web0AuthSession.onLogin(
        tabFrames[ pageInfo.tabId ][ 0 ], tabFrames[ pageInfo.tabId ][ pageInfo.frameId ], credentials.login
      );
      return;
    case constants.SCHEME_WAIT_PASSWORD:
    case constants.SCHEME_LOGIN_SUBMITTED:
      yield delay( constants.CHECK_SCHEME_INTERVAL );
      yield fork( waitScheme, action );
      return;
  }
}

function * waitScheme( action ) {
  const pageInfo = action.payload.pageInfo;
  while ( true ) {
    let storedScheme = getScheme( pageInfo.tabUrl, true );
    if ( !storedScheme ) return;
    action.payload.scheme = {
      ...storedScheme,
      login: action.payload.scheme.login,
      password: action.payload.scheme.password
    };
    let pageResponse = yield Web0AuthSession.checkScheme( pageInfo.tabId, pageInfo.frameId, action.payload.scheme );
    switch ( pageResponse.result ) {
      case constants.SCHEME_AUTOSUBMIT_DONE:
        yield fork( autoLoginFlow, action );
        return;
    }
    yield delay( constants.CHECK_SCHEME_INTERVAL );
  }
}
