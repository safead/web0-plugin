import Signaling from './signaling';
import { action } from '../store';
import * as types from '../constants/actionTypes';

export default class WebRTCClass {
  constructor( params ) {
    this._signaling = null;
    this._peerConnection = null;
    this._dataChannel = null;
    this._shouldBeInitialor = params.shouldBeInitialor;
    this._roomId = params.roomId;
    this._waitForOpponentHandler = params.waitForOpponentHandler;
  }

  start() {
    this._signaling = new Signaling( {
      shouldBeInitialor: this._shouldBeInitialor,
      roomId: this._roomId,
      newICECandidateHandler: this.handleNewICECandidate.bind( this ),
      channelAnswerHandler: this.handleChannelAnswer.bind( this ),
      channelOfferHandler: this.handleChannelOffer.bind( this ),
      errorHandler: WebRTCClass.handleError,
      startWebRTCHandler: this.handleStartWebRTC.bind( this ),
      waitForOpponentHandler: this._waitForOpponentHandler
    } );
  }

  webRTCinit() {
    if ( this._peerConnection ) return true;
    this._peerConnection = new RTCPeerConnection( {
      iceServers: [
        {
          urls: [
            'stun:stun.l.google.com:19302',
            'stun:stun2.l.google.com:19302'
          ]
          /*
          username: '',
          credential: ''
          */
        }
      ]
    } );

    this._peerConnection.onicecandidate = e => {
      if ( !e.candidate ) return;
      this._signaling.send( {
        type: 'new-ice-candidate',
        candidate: e.candidate
      } );
    };

    this._peerConnection.oniceconnectionstatechange = () => {
      switch ( this._peerConnection.iceConnectionState ) {
        case 'closed':
        case 'failed':
        case 'disconnected':
          WebRTCClass.handleError( 'application disconnected' );
          break;
        default:
          break;
      }
    };

    this._peerConnection.onicegatheringstatechange = () => {
    };

    this._peerConnection.onsignalingstatechange = () => {
      switch ( this._peerConnection.signalingState ) {
        case 'closed':
          WebRTCClass.handleError( '[onicegatheringstatechange] DISCONNECT' );
          break;
        default:
          break;
      }
    };

    this._peerConnection.onnegotiationneeded = async () => {
      try {
        await this._peerConnection.setLocalDescription( await this._peerConnection.createOffer() );
        this._signaling.send( {
          type: 'channel-offer',
          sdp: this._peerConnection.localDescription
        } );
      } catch ( ex ) {
        WebRTCClass.handleError( '[EX] onnegotiationneeded: ' + ex );
      }
    };
    return true;
  };

  initDataChannel( dataChannel ) {
    this._dataChannel = dataChannel;
    dataChannel.onopen = () => {
      switch ( dataChannel.readyState ) {
        case 'open':
          action( types.DATACHANNEL_OPENED, dataChannel );
          break;
        default:
          break;
      }
      return true;
    };
    dataChannel.onclose = () => {
      action( types.DATACHANNEL_CLOSED );
      WebRTCClass.handleError( 'Connection closed.' );
    };
  }

  async handleChannelOffer( msg ) {
    try {
      this.webRTCinit();
      this._peerConnection.ondatachannel = e => {
        this.initDataChannel( e.channel );
      };
      await this._peerConnection.setRemoteDescription( new RTCSessionDescription( msg.sdp ) );
      let answer = await this._peerConnection.createAnswer();
      await this._peerConnection.setLocalDescription( answer );
      this._signaling.send( {
        type: 'channel-answer',
        sdp: this._peerConnection.localDescription
      } );
    } catch ( ex ) {
      WebRTCClass.handleError( '[EX] handleChannelOfferMsg: ' + ex );
    }
  }

  handleChannelAnswer( msg ) {
    try {
      this._peerConnection.setRemoteDescription( new RTCSessionDescription( msg.sdp ) );
    } catch ( ex ) {
      WebRTCClass.handleError( '[EX] handleChannelAnswerMsg: ' + ex );
    }
  }

  async handleNewICECandidate( msg ) {
    try {
      this._peerConnection.addIceCandidate( new RTCIceCandidate( msg.candidate ) );
    } catch ( ex ) {
      WebRTCClass.handleError( '[EX] handleNewICECandidateMsg: ' + ex );
    }
  }

  static handleError( msg ) {
    action( types.WEBRTC_ERROR );
  }

  destroy() {
    if ( this._signaling ) {
      this._signaling.destroy();
      this._signaling = null;
    }
    if ( this._dataChannel ) {
      this._dataChannel.close();
      this._dataChannel = null;
    }
    if ( this._peerConnection ) {
      this._peerConnection.close();
      this._peerConnection.onicecandidate = null;
      this._peerConnection.oniceconnectionstatechange = null;
      this._peerConnection.onicegatheringstatechange = null;
      this._peerConnection.onsignalingstatechange = null;
      this._peerConnection.onnegotiationneeded = null;
      this._peerConnection = null;
    }
  }

  handleStartWebRTC() {
    this.webRTCinit();
    this.initDataChannel( this._peerConnection.createDataChannel( 'web0auth' ) );
  }

}
