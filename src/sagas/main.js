import { all, cancel, put, call, take, fork, takeEvery } from 'redux-saga/effects';
import * as types from '../constants/actionTypes';
import { copyText, logError } from '../utils/tools';
import { Web0AuthSession } from '../classes/authSession';
import WebRTCClass from '../classes/webrtc';
import { schemeChanged } from '../actions/passwords';
import persistenceSaga from './persistence';
import { autoLogin } from './autologin';
import { extension } from '../classes/extension';

export default function * rootSaga() {
  yield all( [
    persistenceSaga(),
    startSession(),
    watchWebRTCConnected(),
    watchersSaga()
  ] );
}

export function * watchersSaga() {
  yield takeEvery( types.AUTO_LOGIN, autoLogin );
  yield takeEvery( types.UPDATE_SCHEME, updateSchemeFlow );
  yield takeEvery( types.NEW_CREDENTIALS, newCredentialsFlow );
  yield takeEvery( types.CREATE_PASSWORD, createPasswordFlow );
}

export function * authSessionFlow() {
  try {
    const userData = yield call( [ Web0AuthSession, Web0AuthSession.requestUserData ] );
    if ( !userData ) return yield put( { type: types.AUTHORIZATION_FAILED } );
    let { blockchainCheck, challengeCheck } = yield all( {
      blockchainCheck: call( [
        Web0AuthSession, Web0AuthSession.sessionCheckHashes
      ], userData ),
      challengeCheck: call( [
        Web0AuthSession, Web0AuthSession.sessionChallenge
      ], userData.publicEnc, userData.publicSign )
    } );
    Array.isArray( blockchainCheck ) &&
    blockchainCheck.length === 2 &&
    challengeCheck &&
    ( yield call( [ Web0AuthSession, Web0AuthSession.sessionSuccess ] ) );
    return yield put( { type: types.AUTHORIZATION_SUCCESS } );
  } catch ( ex ) {
    logError( '[ * authSessionFlow]', ex );
    return yield put( { type: types.AUTHORIZATION_FAILED } );
  }
}

export function * watchWebRTCConnected() {
  while ( true ) {
    let task,
      action;
    try {
      action = yield take( types.DATACHANNEL_OPENED );
      Web0AuthSession.setDataChannel( action.payload );
      task = yield fork( authSessionFlow );
      action = yield take( [
        types.DATACHANNEL_CLOSED,
        types.AUTHORIZATION_FAILED,
        types.AUTHORIZATION_CANCELLED
      ] );
    } catch ( ex ) {
      logError( '[ * watchWebRTCConnected]', ex );
    } finally {
      task && ( yield cancel( task ) );
    }
  }
}

export function * startSession() {
  while ( true ) {
    let task,
      WebRTCInstance;
    try {
      yield take( types.START_SESSION );
      const sessionParams = yield call( [ Web0AuthSession, Web0AuthSession.start ] );
      WebRTCInstance = new WebRTCClass( sessionParams );
      task = yield fork( [ WebRTCInstance, WebRTCInstance.start ] );
      const action = yield take( [
        types.WEBRTC_ERROR,
        types.DATACHANNEL_CLOSED,
        types.AUTHORIZATION_CANCELLED,
        types.AUTHORIZATION_FAILED
      ] );
      switch ( action.type ) {
        case types.WEBRTC_ERROR:
          // additional actions
          break;
        case types.DATACHANNEL_CLOSED:
          // additional actions
          break;
        case types.AUTHORIZATION_CANCELLED:
          // additional actions
          break;
        case types.AUTHORIZATION_FAILED:
          // additional actions
          break;
        default:
          break;
      }
    } catch ( ex ) {
      logError( '[ * startSession]', ex );
    } finally {
      task && ( yield cancel( task ) );
      yield put( { type: types.SESSION_CLOSED } );
      Web0AuthSession.terminate();
      WebRTCInstance.destroy();
    }
  }
}

export function * waitPeerConnection() {
  if ( Web0AuthSession.connected() ) return true;
  yield put( { type: types.START_SESSION } );
  const action = yield take( [
    types.AUTHORIZATION_SUCCESS,
    types.SESSION_CLOSED
  ] );
  return action.type === types.AUTHORIZATION_SUCCESS;
}

export function * newCredentialsFlow( action ) {
  try {
    if ( !( yield waitPeerConnection() ) ) return;
    const result = yield Web0AuthSession.newCredentials( action.payload );
    result ? schemeChanged( action.payload ) : Web0AuthSession.onLogout( action.payload.url );
  } catch ( ex ) {
    logError( '[ * newCredentialsFlow]', ex );
  }
}

export function * updateSchemeFlow( action ) {
  try {
    if ( !( yield waitPeerConnection() ) ) return;
    yield Web0AuthSession.schemeUpdate( action.payload );
  } catch ( ex ) {
    logError( '[ * updateSchemeFlow]', ex );
  }
}

export function * createPasswordFlow( action ) {
  try {
    if ( !( yield waitPeerConnection() ) ) return;
    let result = yield Web0AuthSession.createPassword( action.payload.url, action.payload.login );
    if ( !result.newPasswordResult ) return;
    extension.tabs.sendMessage(
      action.payload.tabId,
      {
        id: 'newPassword',
        newPassword: result.newPassword,
        oldPassword: result.oldPassword,
        login: result.login
      },
      { frameId: action.payload.frameId }
    );
    extension.tabs.sendMessage( action.payload.tabId, {
      id: 'message',
      text: copyText( result.oldPassword || result.login ) ?
        'Your ' + ( result.oldPassword ? 'current password' : 'new login' ) + ' is in the clipboard!' :
        'Failed to update clipboard'
    },
    { frameId: 0 } );
  } catch ( ex ) {
    logError( '[ * createPasswordFlow]', ex );
  }
}
