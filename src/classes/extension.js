const apis = [
  'browserAction',
  'commands',
  'contextMenus',
  'runtime',
  'storage',
  'tabs',
  'webNavigation',
  'webRequest',
  'windows'
];

class Extension {
  constructor( apis ) {
    apis.forEach( ( api ) => {
      this[ api ] = null;
      try {
        if ( chrome[ api ] ) this[ api ] = chrome[ api ];
      } catch ( ex ) {}
      try {
        if ( window[ api ] ) this[ api ] = window[ api ];
      } catch ( ex ) {}
      if ( typeof browser !== 'undefined' ) {
        try {
          if ( browser[ api ] ) this[ api ] = browser[ api ];
        } catch ( ex ) {}
        try {
          this.api = browser.extension[ api ];
        } catch ( ex ) {}
      }
    } );
    if ( typeof browser !== 'undefined' ) {
      try {
        if ( browser.runtime ) this.runtime = browser.runtime;
      } catch ( ex ) {}
      try {
        if ( browser.browserAction ) this.browserAction = browser.browserAction;
      } catch ( ex ) {}
    }
  }
}

export const extension = new Extension( apis );

