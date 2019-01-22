import { take } from 'redux-saga/effects';
import Whitelist from '../constants/persistence';
import Store from '../store';

export default function * persistenceSaga() {
  while ( true ) {
    const action = yield take();
    if ( !Whitelist[ action.type ] ) continue;
    Store.save();
  }
}
