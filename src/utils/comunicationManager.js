import { extension } from '../classes/extension';

export const sendMessage = ( message, data, sendMessage ) => {
  extension.tabs.query( { active: true, currentWindow: true }, ( tabs ) => {
    extension.tabs.sendMessage( tabs[ 0 ].id, { action: message, data }, sendMessage );
  } );
};

export class ConnectionToPage {

  constructor( tabId, frameId, onMessage, onDisconnected ) {
    this._tabId = tabId;
    this._frameId = frameId;
    this._onMessage = onMessage;
    this._onDisconnected = onDisconnected;
    this._port = null;
    return this.connect();
  }

  connect() {
    return new Promise( ( res ) => {
      this._port = extension.tabs.connect( this._tabId, { frameId: this._frameId } );
      this._port.onMessage.addListener( this._onMessage );
      this._port.onDisconnect.addListener( this.pageDisconnected.bind( this ) );
      res( this );
    } );
  }

  pageDisconnected() {
    this._onDisconnected && this._onDisconnected( this._tabId, this._frameId );
    this._port = null;
  }

  async sendMessage( msg ) {
    this._port || await this.connect();
    this._port.postMessage( msg );
  }

  close() {
    this._onDisconnected && this._onDisconnected( this._tabId, this._frameId );
    this._port.disconnect();
  }

}
