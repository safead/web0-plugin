import Store, { action } from '../store';
import * as types from '../constants/actionTypes';
import { x2b, b2x, u2b, b2a, b2u } from '../utils/converters';
import { equalAB, getDomain } from '../utils/tools';
import {
  hmac256FromSeed,
  sha256,
  randomBuffer,
  sha256blockchain,
  importPublicKey,
  RSAEncrypt,
  RSAVerify,
  Ciphering,
  generateKeyAES
} from '../utils/crypto';
import { extension } from '../classes/extension';
import * as constants from '../constants/common';
import { getRecordsHashes } from '../utils/ethereum';
import { ConnectionToPage } from '../utils/comunicationManager';
import { QRCodeURL } from '../utils/qrcode';
import { passwordsSchemes, syncronozeAcessDomainsPlugin, schemeChanged } from '../actions/passwords';

class AuthSession {
  constructor() {
    this.resetState();
    this._loggedInDomains = {};
    this._ports = {};
    this.popupWindow = null;
    this._id = ( Date.now() / 1000 | 0 ) + '_' + Math.random();
    extension.windows.onRemoved.addListener( ( winId ) => {
      if ( this.popupWindow && winId === this.popupWindow && !this.connected() ) {
        this.popupWindow = null;
        this.close();
      }
    } );
  }

  connected() {
    return this._state === 10;
  }

  resetState() {
    this._state = 0;
    this._waiters = {};
    this._sessionStarted = 0;
    this.peerDataChannel = null;
    this._challenge = null;
    this._peerPublicKeySign = null;
    this._peerPublicKeyEnc = null;
    this._peerAlias = null;
    extension.browserAction.setIcon( {
      path: constants.ICON_DISCONNECTED
    } );
  }

  async start() {
    if ( this._state > 0 ) return;
    this._state = 1;
    this._sessionKey = randomBuffer( 32 );
    this._sessionCipher = new Ciphering( await generateKeyAES( new Uint8Array( this._sessionKey ) ) );
    return {
      shouldBeInitialor: true,
      roomId: b2x( ( await sha256( this._sessionKey ) ).slice( 0, 20 ) ),
      waitForOpponentHandler: this.showQRCode.bind( this )
    };
  }

  close() {
    action( types.AUTHORIZATION_CANCELLED, { reason: 'User cancelled the connection', id: this._id } );
  }

  closePopup() {
    if ( !this.popupWindow ) return;
    this.popupWindow && extension.windows.remove( this.popupWindow, () => {
      if ( extension.runtime.lastError ) {}
    } );
    this.popupWindow = null;
    action( types.AUTH_SESSION_CHANGE, { qrcode: '' } );
  }

  terminate( message = '' ) {
    if ( !this._state ) return;
    for ( let i in this._waiters ) this._waiters.hasOwnProperty( i ) && this.finalizeResolver( i, false );
    for ( let tabId in this._ports ) this._ports[ tabId ].close();
    action( types.PROCESSING_TABS_DELETE_ALL );
    action( types.PRE_SCHEMES_DELETE_ALL );
    this.closePopup();
    this.resetState();
  }

  requestUserData() {
    return new Promise( ( res ) => {
      this._requiredUserData = {
        records: [],
        actions: [ {
          passDomains: passwordsSchemes()
        } ]
      };
      this.sendToPeer( {
        authRequest: this._requiredUserData.records,
        actions: this._requiredUserData.actions,
        peerId: 'MY_COOL_CHROME_PLUGIN',
        processId: this.addResolver( res )
      } );
      return true;
    } );
  }

  sessionReject( payload = {} ) {
    this.peerDataChannel && payload.reason && this.sendToPeer( {
      error: payload.reason,
      data: payload.data || ''
    } );
    return false;
  }

  dataResponse( response ) {
    this._state = 5;
    if ( !response.records || !( response.records instanceof Array ) ) {
      return this.sessionReject( { reason: 'Field required', data: 'Personal records' } );
    }
    if ( !response.alias ) {
      return this.sessionReject( { reason: 'Field required', data: 'Alias' } );
    }
    if ( !response.chainId ) {
      return this.sessionReject( { reason: 'Field required', data: 'Chain Id' } );
    }
    if ( !response.publicEnc ) {
      return this.sessionReject( { reason: 'Field required', data: 'Public RSA encryption key' } );
    }
    if ( !response.publicSign ) {
      return this.sessionReject( { reason: 'Field required', data: 'Public RSA signing key' } );
    }
    if ( Store.getState().authSession.requireMainnet && response.chainId !== 1 ) {
      return this.sessionReject( { reason: 'This website do not accept users from Ethereum testnet. ' +
        'Your authentication records must be deployed on the main Ethereum network' } );
    }
    let i, j, requiredRecords = this._requiredUserData.records.slice( 0 );
    this._peerAlias = response.alias;
    for ( i = 0; i < response.records.length; i++ ) {
      if ( !response.records[ i ].value ) {
        return this.sessionReject( { reason: 'Field required', data: response.records[ i ].id } );
      }
      for ( j = 0; j < requiredRecords.length; j++ ) {
        if ( requiredRecords[ j ] !== response.records[ i ].id ) continue;
        requiredRecords.splice( j, 1 );
        break;
      }
    }
    if ( this._requiredUserData.actions ) {
      for ( i = 0; i < this._requiredUserData.actions.length; i++ ) {
        let key = Object.keys( this._requiredUserData.actions[ i ] )[ 0 ];
        switch ( key ) {
          case 'passDomains':
            if ( !( response.passDomains instanceof Object ) ) {
              return this.sessionReject( { reason: 'Data required', data: 'sync data is corrupted' } );
            }
            syncronozeAcessDomainsPlugin( response.passDomains );
            break;
        }
      }
    }
    if ( requiredRecords.length ) return this.sessionReject( { reason: 'Not all records sent!' } );
    return this.finalizeResolver( response.processId, response );
  }

  sessionCheckHashes( response ) {
    return new Promise( async ( res, rej ) => {
      try {
        let hashesHMAC = await Promise.all( response.records.map( async record => {
          return '0x' + b2x( ( await hmac256FromSeed( x2b( record.hmacSeed ), u2b( record.value ) ) ).hash );
        } ) );
        let hashesFromBlockchain = (
          await getRecordsHashes(
            response.chainId,
            this._peerAlias,
            [ this._peerAlias + ':publicEnc', this._peerAlias + ':publicSign' ]
              .concat( response.records.map( record => {
                return record.id;
              } ) )
          )
        ).hashes;
        if (
          !hashesFromBlockchain.length ||
          hashesFromBlockchain.length !== hashesHMAC.length + 2 ||
          hashesFromBlockchain.length !== this._requiredUserData.records.length + 2
        ) return this.sessionReject( { reason: 'Blockchain records check failed', data: 'wrong records count' } );
        if ( await sha256blockchain( response.publicEnc ) !== hashesFromBlockchain[ 0 ] ) {
          return this.sessionReject(
            { reason: 'Blockchain records check failed', data: 'Public RSA encryption key wrong!' }
          );
        }
        if ( await sha256blockchain( response.publicSign ) !== hashesFromBlockchain[ 1 ] ) {
          return this.sessionReject(
            { reason: 'Blockchain records check failed', data: 'Public RSA signing key wrong!' }
          );
        }
        for ( let i = 0; i < hashesHMAC.length; i++ ) {
          if ( hashesFromBlockchain[ i + 2 ] !== hashesHMAC[ i ] ) {
            return this.sessionReject( {
              reason: 'Blockchain records check failed',
              data: 'provided records are not in blockchain!'
            } );
          }
        }
        return res( [ response.publicEnc, response.publicSign ] );
      } catch ( ex ) {
        return rej( 'sessionCheckHashes failed' );
      }
    } );
  }

  sessionChallenge( publicEncPEM, publicSignPEM ) {
    return new Promise( async ( res, rej ) => {
      this._state = 6;
      try {
        this._challenge = randomBuffer( 128 ).buffer;
        this._peerPublicKeyEnc = await importPublicKey( 'ENC', publicEncPEM );
        this._peerPublicKeySign = await importPublicKey( 'SIGN', publicSignPEM );
        let encrypted = await RSAEncrypt( this._peerPublicKeyEnc, this._challenge );
        return this.sendToPeer( {
          authChallenge: b2x( encrypted ),
          processId: this.addResolver( res )
        } );
      } catch ( ex ) {
        return rej( 'sessionChallenge failed' );
      }
    } );
  }

  async challengeResponse( response ) {
    if (
      !equalAB( x2b( response.decrypted ), this._challenge ) ||
      !( await RSAVerify( this._peerPublicKeySign, x2b( response.signature ), this._challenge ) )
    ) {
      this.sessionReject( {
        reason: 'Challenge check failed',
        data: 'Decrypted value is wrong!'
      } );
      return this.finalizeResolver( response.processId, false );
    }
    return this.finalizeResolver( response.processId, true );
  }

  sessionSuccess() {
    this._state = 10;
    this.closePopup();
    this._sessionStarted = Date.now() / 1000 | 0;
    this.sendToPeer( {
      success: 'You have been successfully authorized!'
    } );
    extension.browserAction.setIcon( {
      path: constants.ICON_CONNECTED
    } );
  }

  async showQRCode() {
    action( types.AUTH_SESSION_CHANGE, {
      qrcode: await QRCodeURL( JSON.stringify( {
        u: window.location.href.substr( 0, window.location.href.indexOf( '/', 8 ) ),
        k: Array.from( this._sessionKey )
      } ) )
    } );
    extension.windows.getCurrent( ( win ) => {
      let width = 333,
        height = 357;
      extension.windows.create( {
        type: 'popup',
        focused: true,
        url: 'popup/index.html',
        left: Math.round( ( ( win.width / 2 ) - ( width / 2 ) ) + win.left ),
        top: Math.round( ( ( win.height / 2 ) - ( height / 2 ) ) + win.top ),
        width: width,
        height: height
      } );
      extension.windows.getCurrent( win => {
        this.popupWindow = win.id;
      } );
    } );
  }

  setDataChannel( dataChannel ) {
    this.peerDataChannel = dataChannel;
    this.peerDataChannel.onmessage = async e => {
      try {
        let json = JSON.parse( e.data );
        if (
          Object.keys( json )[ 0 ] !== 'iv' ||
          !( json.iv instanceof Array ) ||
          typeof json.encoded !== 'string'
        ) {
          return;
        }
        let decoded = b2u( await this._sessionCipher.decipher( json.iv, json.encoded ) ), command;
        json = JSON.parse( decoded );
        command = Object.keys( json )[ 0 ];
        switch ( command ) {
          case 'alias':
            this.dataResponse( json );
            return;
          case 'decrypted':
            this.challengeResponse( json );
            return;
          case 'accessInfo':
            this.processAccessInfo( json[ command ], json.processId );
            break;
          case 'credentialsReceived':
            this.finalizeResolver( json.processId, !!json[ command ] );
            break;
          case 'newPasswordResult':
            this.finalizeResolver( json.processId, json );
            break;
          case 'updateSchemeResult':
            this.finalizeResolver( json.processId, !!json[ command ] );
            break;
          default:
            break;
        }
      } catch ( ex ) {}
    };
  }

  async sendToPeer( data ) {
    if ( !this.peerDataChannel ) throw new Error( '[error] no peer connection or data channel object' );
    let encoded = await this._sessionCipher.encipher( JSON.stringify( data ) );
    encoded.iv = Array.from( encoded.iv );
    encoded.encoded = b2a( encoded.encoded );
    try {
      return this.peerDataChannel.send( JSON.stringify( encoded ) );
    } catch ( ex ) {
      return false;
    }
  }

  async sendToPage( tabId, frameId, data ) {
    this._ports[ tabId + '-' + frameId ] ||
    ( this._ports[ tabId + '-' + frameId ] = await new ConnectionToPage( tabId, frameId, msg => {
      switch ( msg.id ) {
        case 'cancelQR':
          this.terminate( 'QR code cancelled' );
          break;
        case 'schemeReady':
          this.finalizeResolver( msg.processId, msg.scheme );
          break;
        case 'checkScheme':
          this.finalizeResolver( msg.processId, { result: msg.result, scheme: msg.scheme } );
          break;
        case 'fillDone':
          switch ( msg.result ) {
            case constants.SCHEME_LOGIN_SUBMITTED:
            case constants.SCHEME_AUTOSUBMIT_DONE:
              this.sendToPage( msg.tabId, msg.frameId, { id: 'submit' } );
          }
          this.finalizeResolver( msg.processId, { scheme: msg.scheme, result: msg.result } );
          break;
        default:
          return false;
      }
      return true;
    }, ( disconnectedTabId, disconnectedFrameId ) => {
      delete this._ports[ disconnectedTabId + '-' + disconnectedFrameId ];
      for ( let id in this._waiters ) {
        if ( !this._waiters.hasOwnProperty( id ) || this._waiters[ id ].tabId !== disconnectedTabId ) continue;
        this.finalizeResolver( id, false );
      }
    } ) );
    this._ports[ tabId + '-' + frameId ].sendMessage( data );
  }

  requestAccessInfo( url, scheme ) {
    return new Promise( res => {
      this.sendToPeer( {
        accessInfo: getDomain( url, { rootDomain: true } ),
        scheme: scheme,
        processId: this.addResolver( res )
      } );
    } );
  }

  processAccessInfo( scheme, processId ) {
    scheme = scheme instanceof Object && Object.keys( scheme ).length ? scheme : null;
    this.finalizeResolver( processId, scheme );
  }

  schemeUpdate( scheme ) {
    schemeChanged( { ...scheme } );
    return new Promise( res => {
      this.sendToPeer( {
        updateScheme: getDomain( scheme.url, { rootDomain: true } ),
        scheme: { ...scheme, time: Date.now() / 1000 | 0 },
        processId: this.addResolver( res )
      } );
    } );
  }

  createPassword( url, login ) {
    return new Promise( res => {
      this.sendToPeer( {
        createPassword: {
          url: url,
          login: login
        },
        processId: this.addResolver( res )
      } );
    } );
  }

  createScheme( tabId, frameId ) {
    return new Promise( res => {
      this.sendToPage( tabId, frameId, {
        id: 'createScheme',
        processId: this.addResolver( res, '', tabId )
      } );
    } );
  }

  fillScheme( tabId, frameId, scheme ) {
    return new Promise( res => {
      this.sendToPage( tabId, frameId, {
        id: 'fillScheme',
        scheme: scheme,
        frameId: frameId,
        tabId: tabId,
        processId: this.addResolver( res, '', tabId )
      } );
    } );
  }

  checkScheme( tabId, frameId, scheme ) {
    return new Promise( res => {
      return this.sendToPage( tabId, frameId, {
        id: 'checkScheme',
        scheme: scheme,
        tabId: tabId,
        frameId: frameId,
        processId: this.addResolver( res, '', tabId )
      } );
    } );
  }

  newCredentials( scheme ) {
    if ( this.isLoggedIn[ scheme.url ] ) return Promise.resolve( false );
    return new Promise( res => {
      this.sendToPeer( {
        newCredentials: scheme,
        processId: this.addResolver( res )
      } );
    } );
  }

  onLogin( sourceUrl, targetUrl, login ) {
    targetUrl || ( targetUrl = sourceUrl );
    const sourceDomainRoot = getDomain( sourceUrl, { rootDomain: true } ),
      targetDomainRoot = sourceUrl === targetUrl ? sourceDomainRoot : getDomain( targetUrl, { rootDomain: true } ),
      targetDomain = getDomain( targetUrl, { noPrefix: true } );
    if ( !sourceDomainRoot || !targetDomainRoot || !targetDomain ) return;
    if ( !this._loggedInDomains[ targetDomainRoot ] ) {
      this._loggedInDomains[ targetDomainRoot ] = { login: login };
      if ( sourceDomainRoot !== targetDomainRoot ) {
        this._loggedInDomains[ targetDomainRoot ].source = sourceDomainRoot;
        this._loggedInDomains[ targetDomainRoot ].login = this._loggedInDomains[ sourceDomainRoot ].login;
      }
    }
    this._loggedInDomains[ targetDomainRoot ][ targetDomain ] = true;
  }

  onLogout( tabUrl, linkedDomain = '' ) {
    const domain = linkedDomain || getDomain( tabUrl, { rootDomain: true } ),
      _removeSource = ( sourceDomainRoot ) => {
        for ( let i in this._loggedInDomains ) {
          if (
            !this._loggedInDomains.hasOwnProperty( i ) ||
            this._loggedInDomains[ i ].source !== sourceDomainRoot
          ) continue;
          delete this._loggedInDomains[ i ];
          _removeSource( i );
        }
      };
    if ( !this._loggedInDomains[ domain ] ) return;
    if ( this._loggedInDomains[ domain ].source ) this.onLogout( '', this._loggedInDomains[ domain ].source );
    delete this._loggedInDomains[ domain ];
    _removeSource( domain );
  }

  isLoggedIn( url ) {
    if ( !url ) return false;
    const rootDomain = getDomain( url, { rootDomain: true } );
    if ( !this._loggedInDomains[ rootDomain ] ) return false;
    return this._loggedInDomains[ rootDomain ].login;
  }

  addResolver( resolveFunc, id = '', tabId = '' ) {
    id = id || ( Date.now() / 1000 | 0 ) + '_' + Math.random();
    this._waiters[ id ] || ( this._waiters[ id ] = { resolvers: [] } );
    this._waiters[ id ].resolvers.push( resolveFunc );
    this._waiters[ id ].tabId = tabId;
    return id;
  }

  finalizeResolver( id, result ) {
    if ( !this._waiters[ id ] ) return;
    for ( let i = 0; i < this._waiters[ id ].resolvers.length; i++ ) this._waiters[ id ].resolvers[ i ]( result );
    delete this._waiters[ id ];
  }
}

export const Web0AuthSession = new AuthSession();
