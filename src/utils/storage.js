import msgpack from 'msgpack-lite';
import { b2a, a2b } from './converters';

class Storage {

  static write( name, data, permanent = true ) {
    data = b2a( msgpack.encode( data ) );
    try {
      ( permanent ? window.localStorage : window.sessionStorage ).setItem( name, data );
    } catch ( ex ) {
      console.error( '[ex] Storage.write', ex );
    }
  }

  static read( name, permanent = true ) {
    try {
      let result = ( permanent ? window.localStorage : window.sessionStorage ).getItem( name );
      return result ? msgpack.decode( a2b( result ) ) : null;
    } catch ( ex ) {
      console.error( '[ex] Storage.read', ex );
    }
    return true;
  }

}

/** TODO: ASYNC EXTENSION STORAGE

import ext from "./ext";
class Storage{

  static write(name, data){
    console.log('Storage.write');
    return new Promise((res) => {
      ext.storage.local.set({name: data}, (result) => {
        console.log('Storage.write result', result);
        res(result);
      });
    });

  }

  static read(name){
    console.log('Storage.read');
    return new Promise((res) => {
      ext.storage.local.get(name, (result) => {
        console.log('Storage.read result', result);
        res(result);
      });
    });
  }

}
*/

export default Storage;
