import * as types from '../constants/actionTypes';

export const passwords = ( state = null, action ) => {
  switch ( action.type ) {
    case types.PASSWORD_ITEM_CHANGE:
      state[ action.domain ] = { ...state[ action.domain ], ...action.params };
      return state;
    case types.PASSWORD_ITEM_ADD:
      state[ action.domain ] = action.params;
      return state;
    case types.PASSWORD_ITEM_DELETE:
      delete state[ action.domain ];
      return state;
    case types.PASSWORDS_ALL_DELETE:
      return {};
    default:
      return state;
  }
};
