import { createStore, applyMiddleware } from 'redux';
import { combineReducers } from 'redux';
import { authSession } from './reducers/authSession';
import { passwords } from './reducers/passwords';
import { frameRealUrl, processingTabs, loginChain, preSchemes, currentActiveTabId } from './reducers/background';
import * as types from './constants/actionTypes';
import createSagaMiddleware from 'redux-saga';
import Storage from './utils/storage';
import { wrapStore } from 'react-chrome-redux';
import rootSaga from './sagas/main.js';

const getInitialState = () => {
  return {
    authSession: {
      requireMainnet: 0,
      status: 0,
      logs: '',
      duration: 0,
      qrcode: ''
    },
    passwords: {},
    frameRealUrl: {},
    processingTabs: {},
    loginChain: {},
    preSchemes: {},
    currentActiveTabId: null
  };
};

const appReducer = combineReducers( {
  authSession,
  passwords,
  frameRealUrl,
  processingTabs,
  loginChain,
  preSchemes,
  currentActiveTabId
} );

const rootReducer = ( state, action ) => {
  action.type === types.RESET_STATE && ( state = getInitialState() );
  return appReducer( state, action );
};

const getReduxState = () => {
  try {
    let loadedState = Storage.read( 'reduxState' ) || {};
    loadedState.authSession = {
      status: 0, // 0 - silent, 1 - init, 2 - signaling, 3 - app confirmation,
      // 4 - processing data, 5 - challenge, 10 - connected
      duration: 0,
      requireMainnet: 0,
      logs: '',
      authRequest: [],
      actions: [],
      sessionKey: [],
      qrcode: ''
    };
    loadedState.frameRealUrl = {};
    loadedState.processingTabs = {};
    loadedState.loginChain = {};
    return { ...getInitialState(), ...loadedState };
  } catch ( ex ) {
    return getInitialState();
  }
};

const sagaMiddleware = createSagaMiddleware();

const Store = createStore(
  rootReducer,
  getReduxState(),
  applyMiddleware( sagaMiddleware )
);

sagaMiddleware.run( rootSaga );
wrapStore( Store, { portName: 'web0' } );

export const resetState = () => {
  return { type: types.RESET_STATE };
};

Store.save = () => {
  Storage.write( 'reduxState', Store.getState() );
};

export const action = ( type, payload ) => Store.dispatch( {
  type: type,
  payload: payload
} );

export default Store;
