import React from 'react';
import { render } from 'react-dom';
import Popup from './containers/popup/popup';
import { Store } from 'react-chrome-redux';
import { Provider } from 'react-redux';

const proxyStore = new Store( {
  portName: 'web0'
} );

proxyStore.ready().then( () => {
  render(
    <Provider store={proxyStore}>
      <Popup />
    </Provider>,
    document.getElementById( 'container' )
  );
} );
