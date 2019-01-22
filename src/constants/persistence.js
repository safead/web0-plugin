import * as types from './actionTypes';

const Whitelist = {
  [ types.PASSWORD_ITEM_CHANGE ]: true,
  [ types.PASSWORD_ITEM_DELETE ]: true,
  [ types.PASSWORD_ITEM_CHANGE_BATCH ]: true,
  [ types.PASSWORDS_ALL_DELETE ]: true,
  [ types.PASSWORD_ITEM_ADD ]: true
};

export default Whitelist;
