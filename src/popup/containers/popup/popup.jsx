import '@babel/polyfill';
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { extension } from '../../../classes/extension';

class Popup extends Component {

  constructor( props ) {
    console.log( '[Popup.constructor]', props );
    super( props );
  }

  static disconnectWithApp() {
    extension.runtime.sendMessage( { id: 'terminateSession' } );
    window.close();
  }

  render() {
    if ( this.props.authSession.qrcode ) {
      document.addEventListener( 'keyup', e => {
        ( e.keyCode === 27 ) && Popup.disconnectWithApp();
      } );
      return (
        <div onClick={ Popup.disconnectWithApp }>
          <img alt='' src={ this.props.authSession.qrcode } />
        </div>
      );
    }

    return (
      <div>&nbsp;</div>
    );
  }

}

Popup.propTypes = {
  authSession: PropTypes.object.isRequired
};

const mapStateToProps = state => ( {
  authSession: state.authSession
} );

export default connect(
  mapStateToProps
)( Popup );
