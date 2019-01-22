import * as constants from '../constants/common';

class Signaling {

  constructor( params ) {
    this._shouldBeInitialor = params.shouldBeInitialor || false;
    this._roomId = params.roomId;
    this._myPeerId = '';
    this._opponentPeerId = '';
    this._connection = new WebSocket( constants.SIGNALING_SERVER_URL, 'json' );
    this._newICECandidateHandler = params.newICECandidateHandler;
    this._channelAnswerHandler = params.channelAnswerHandler;
    this._channelOfferHandler = params.channelOfferHandler;
    this._startWebRTCHandler = params.startWebRTCHandler;
    this._waitForOpponentHandler = params.waitForOpponentHandler;
    this._errorHandler = params.errorHandler;
    this._connection.onopen = Signaling.onopen;
    this._connection.onmessage = this.onmessage.bind( this );
    this._connection.onerror = this.onerror.bind( this );
  }

  send( msg ) {
    msg = { ...msg, ...{
      from: this._myPeerId,
      to: this._opponentPeerId,
      roomId: this._roomId
    } };
    let msgJSON = JSON.stringify( msg );
    this._connection.send( msgJSON );
  }

  destroy() {
    if ( !this._connection ) return;
    this._connection.onopen = null;
    this._connection.onmessage = null;
    this._connection.close();
    this._connection = null;
  }

  static onopen( e ) {
  }

  onerror( e ) {
    this._errorHandler( 'WebSocket connection failed!' );
  }

  onmessage( e ) {
    let msg = JSON.parse( e.data ),
      selfFound = false,
      i;
    switch ( msg.type ) {
      case 'init':
        this._myPeerId = msg.id;
        this.send( {
          roomId: this._roomId,
          type: 'joinroom'
        } );
        break;
      case 'userlist':
        for ( i = 0; i < msg.users.length; i++ ) {
          if ( msg.users[ i ] === this._myPeerId ) {
            selfFound = true;
            continue;
          }
          this._opponentPeerId = msg.users[ i ];
          break;
        }
        if ( this._shouldBeInitialor ) {
          selfFound || this._errorHandler( 'Server peer not found!' );
        } else {
          this._opponentPeerId || this._errorHandler( 'Server peer not found!' );
        }
        break;
      case 'roomjoined':
        this._shouldBeInitialor ? this._waitForOpponentHandler() : this._startWebRTCHandler();
        break;
      case 'roomisfull':
        this._errorHandler( 'WebRTC room is full!' );
        break;
      case 'channel-offer':
        this._channelOfferHandler( msg );
        break;
      case 'channel-answer':
        this._channelAnswerHandler( msg );
        break;
      case 'new-ice-candidate':
        this._newICECandidateHandler( msg );
        break;
      default:
        return this._errorHandler( 'Unknown message received ' + msg.type );
    }
    return true;
  }
}

export default Signaling;
