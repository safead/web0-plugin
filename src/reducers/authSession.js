import * as types from '../constants/actionTypes';

export const authSession = ( state = null, action ) => {
  switch ( action.type ) {
    case types.AUTH_SESSION_CHANGE:
      return { ...state, ...action.payload };
    default:
      return state;
  }
};
