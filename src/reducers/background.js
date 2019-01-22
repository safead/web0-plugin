import * as types from '../constants/actionTypes';

export const frameRealUrl = ( state = null, action ) => {
  switch ( action.type ) {
    case types.FRAME_REAL_URL_DELETE:
      delete state[ action.payload ];
      return state;
    case types.FRAME_REAL_URL_ADD:
      state[ action.payload.tabId ] || ( state[ action.payload.tabId ] = { 0: '' } );
      state[ action.payload.tabId ][ action.payload.frameId ] = action.payload.url;
      return state;
    default:
      return state;
  }
};

export const processingTabs = ( state = null, action ) => {
  switch ( action.type ) {
    case types.PROCESSING_TABS_DELETE:
      delete state[ action.payload ];
      return state;
    case types.PROCESSING_TABS_DELETE_ALL:
      return {};
    case types.PROCESSING_TABS_ADD:
      return { ...state, ...{ [ action.payload.tabId ]: action.payload.scheme } };
    default:
      return state;
  }
};

export const preSchemes = ( state = null, action ) => {
  switch ( action.type ) {
    case types.PRE_SCHEMES_DELETE:
      delete state[ action.payload ];
      return state;
    case types.PRE_SCHEMES_DELETE_ALL:
      return {};
    case types.PRE_SCHEMES_ADD:
      return { ...state, ...{ [ action.payload.domain ]: action.payload.scheme } };
    default:
      return state;
  }
};

export const loginChain = ( state = null, action ) => {
  switch ( action.type ) {
    case types.LOGIN_CHAIN_DELETE:
      delete state[ action.payload ];
      return state;
    case types.LOGIN_CHAIN_ADD:
      return { ...state, ...{ [ action.payload.tabId ]: action.payload.url } };
    default:
      return state;
  }
};

export const currentActiveTabId = ( state = null, action ) => {
  switch ( action.type ) {
    case types.ACTIVE_TAB_CHANGE:
      return action.payload;
    default:
      return state;
  }
};
