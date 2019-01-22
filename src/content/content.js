'use strict';
import * as constants from '../constants/common';

class ContentScript {

  constructor() {
    this._QRImage = null;
    this.loginSubmitted = false;
    this.resetState();
    this.cancel = this.cancel.bind( this );
    this.onMessage = this.onMessage.bind( this );
    this.pluginDisconnected = this.pluginDisconnected.bind( this );
    this.pluginConnected = this.pluginConnected.bind( this );
    chrome.runtime.onConnect.addListener( this.pluginConnected );

    document.addEventListener( 'mousedown', e => {
      if (
        !e.isTrusted ||
        e.button !== 2 ||
        !ContentScript.inputIsTyping( e.target )
      ) return false;
      chrome.extension.sendMessage( {
        id: 'updateMenuItem',
        haveTextInInput: !!e.target.value,
        isPasswordInput: ContentScript.inputCanBePassword( e.target )
      } );
      return true;
    }, true );

    chrome.runtime.onMessage.addListener( ( msg, sender, sendResponse ) => {
      if ( sender.tab ) return;
      switch ( msg.id ) {
        case 'checkFormSubmit':
          if ( !this._scheme || ( !this._canBeSubmitted && !msg.getCredentials ) ) break;
          msg.getCredentials || ( this._canBeSubmitted = false );
          if ( this._scheme.password || this._scheme.login ) {
            if ( this._possibleSubmit ) this._scheme[ this._schemeIndex ].submit = this._possibleSubmit;
            sendResponse( { scheme: this._scheme } );
            this.resetState();
          } else sendResponse( { scheme: null } );
          return;
        case 'checkLoaded':
          sendResponse( true );
          return;
        case 'message':
          showMessage( msg.text );
          return;
        case 'password':
          document.activeElement &&
          ContentScript.inputCanBePassword( document.activeElement ) &&
          ( document.activeElement.value = msg.value );
          return;
        case 'newPassword':
          this.fillNewPassword( msg.newPassword, msg.oldPassword, msg.login );
      }
    } );

    document.addEventListener( 'click', e => {
      if ( !e.isTrusted || this.loginDone ) return;
      this._possibleSubmit = this.getLastClickedScheme( e.target );
      if ( this._schemeIndex && this._possibleSubmit && this._waitSubmitClicked ) {
        if ( this.shouldBeSilent() ) return;
        this._scheme[ this._schemeIndex ].submit = this._possibleSubmit;
        this.newSchemeFound();
        this.loginDone = true;
        return;
      }
      if (
        this._scheme &&
        ContentScript.inputIsTyping( e.target ) &&
        !( e.target === this._passwordInput || e.target === this._loginInput )
      ) this.resetState();
      let clickedOnEditableElement = this.clickedOnEditableElement( e.target );
      this.updateScheme( ContentScript.inputIsTyping( e.target ) ? { catchFocused: true } : { catchFilled: true } );
      this._canBeSubmitted = !!this._scheme && !clickedOnEditableElement;
    }, true );

    document.addEventListener( 'keyup', e => {
      if ( this.loginDone || !e.isTrusted || e.keyCode === 13 ) return;
      e.target.tagName === 'INPUT' &&
      ContentScript.inputIsTyping( e.target ) &&
      this.updateScheme( { catchFilled: true } );
    }, true );

    document.addEventListener( 'keydown', e => {
      if ( this.loginDone || !e.isTrusted ) return;
      if ( e.keyCode === 13 ) this._canBeSubmitted = true;
    }, true );

  }

  newSchemeFound() {
    chrome.extension.sendMessage( {
      id: 'schemeUpdate',
      scheme: this._scheme,
      tabId: this._tabId
    } );
  }

  shouldBeSilent() {
    this._loginInput = this._loginInput ?
      ( document.body.contains( this._loginInput ) ? this._loginInput : null ) : null;
    this._passwordInput = this._passwordInput ?
      ( document.body.contains( this._passwordInput ) ? this._passwordInput : null ) : null;
    return !( this._passwordInput || this._loginInput );
  }

  onMessage( msg ) {
    switch ( msg.id ) {
      case 'createScheme':
        this.createScheme();
        this.sendMessage( {
          id: 'schemeReady',
          scheme: this._scheme,
          processId: msg.processId
        } );
        break;
      case 'fillScheme':
        return this.fillScheme( msg );
      case 'resetState':
        return this.resetState();
      case 'checkScheme':
        return this.checkScheme( msg );
      case 'submit':
        this.submit() || this.helpFindSubmit();
        break;
      default:
        return this.sendMessage( false );
    }
    return true;
  }

  sendMessage( msg ) {
    this._port && this._port.postMessage( msg );
  }

  pluginConnected( port ) {
    this._port = port;
    this._port.onMessage.removeListener( this.onMessage );
    this._port.onMessage.addListener( this.onMessage );
    this._port.onDisconnect.addListener( this.pluginDisconnected );
  }

  pluginDisconnected() {
    this._port.onMessage.removeListener( this.onMessage );
    this._port.onDisconnect.removeListener( this.pluginDisconnected );
    this._port.disconnect();
    this._port = null;
  }

  getLastClickedScheme( clickedElem ) {
    if (
      !this._scheme ||
      !clickedElem ||
      !clickedElem.tagName ||
      ( clickedElem.tagName === 'INPUT' && ContentScript.inputIsTyping( clickedElem ) )
    ) return false;
    let allTags = document.body.getElementsByTagName( clickedElem.tagName );
    this.submitAlertDiv && this.submitAlertDiv.remove();
    for ( let i = 0; i < allTags.length; i++ ) {
      if ( allTags[ i ] === clickedElem ) return { [ clickedElem.tagName ]: i };
    }
    return {};
  }

  resetState() {
    this._scheme = null;
    this._canBeSubmitted = false;
    this._possibleSubmit = null;
    this._waitSubmitClicked = false;
    this._loginInput = null;
    this._passwordInputsLength = 0;
    this._passwordInput = null;
    this._allInputs = [];
    this._selects = [];
    this._checkboxes = [];
    this.loginDone = false;
  }

  updateScheme( params ) {
    if ( this._scheme ) {
      this._scheme = this.updateValues();
      return;
    }
    this.createScheme( params );
  }

  fillScheme( msg ) {
    this._tabId = msg.tabId;
    this.collectInputs();
    this._scheme = msg.scheme;
    this.fillSchemeDOM().then( result => {
      this.sendMessage( {
        id: 'fillDone',
        scheme: this._scheme,
        tabId: msg.tabId,
        frameId: msg.frameId,
        processId: msg.processId,
        result: result
      } );
    } );
  }

  checkScheme( msg ) {
    this.loginDone = false;
    this.collectInputs();
    this._scheme = msg.scheme;
    this.fillSchemeDOM( true ).then( result => {
      this.sendMessage( {
        id: 'checkScheme',
        scheme: this._scheme,
        processId: msg.processId,
        result: result
      } );
    } );
  }

  helpFindSubmit() {
    chrome.extension.sendMessage( {
      id: 'showMessage',
      text: 'Click on submit button to enable auto login',
      tabId: this._tabId
    } );
  }

  collectInputs() {
    let allInputs = document.getElementsByTagName( 'input' ),
      i;
    this._allInputs = [];
    this._selects = document.getElementsByTagName( 'select' );
    this._checkboxes = [];
    this._passwordInputsLength = 0;
    for ( i = 0; i < allInputs.length; i++ ) {
      if ( ContentScript.inputIsCheckbox( allInputs[ i ] ) ) {
        this._checkboxes.push( allInputs[ i ] );
        continue;
      }
      if (
        !ContentScript.inputIsTyping( allInputs[ i ] ) ||
        !ContentScript.inViewPort( allInputs[ i ] )
      ) continue;
      ContentScript.inputCanBePassword( allInputs[ i ] ) && this._passwordInputsLength++;
      this._allInputs.push( allInputs[ i ] );
    }
  }

  createScheme( params = { catchFocused: true } ) {
    this.collectInputs();
    this._scheme = {};
    for ( let i = 0; i < this._allInputs.length; i++ ) {
      if (
        ( params.catchFocused && this._allInputs[ i ] === document.activeElement ) ||
        ( params.catchFilled && ContentScript.inputIsTyping( this._allInputs[ i ] ) && this._allInputs[ i ].value )
      ) {
        if ( ContentScript.inputCanBeLogin( this._allInputs[ i ] ) ) {
          this._schemeIndex = this._allInputs.length === 1 ? 1 : 3;
          this._scheme[ this._schemeIndex ] = {};
          this._loginInput = this._allInputs[ i ];
          this._scheme[ this._schemeIndex ].lIndex = i;
          if ( i < this._allInputs.length - 1 && ContentScript.inputCanBePassword( this._allInputs[ i + 1 ] ) ) {
            this._passwordInput = this._allInputs[ i + 1 ];
            this._scheme[ this._schemeIndex ].pIndex = i + 1;
          }
        } else if ( ContentScript.inputCanBePassword( this._allInputs[ i ] ) ) {
          this._schemeIndex = this._allInputs.length === 1 ? 2 : 3;
          this._scheme[ this._schemeIndex ] = {};
          this._passwordInput = this._allInputs[ i ];
          this._scheme[ this._schemeIndex ].pIndex = i;
          if ( i > 0 && ContentScript.inputCanBeLogin( this._allInputs[ i - 1 ] ) ) {
            this._loginInput = this._allInputs[ i - 1 ];
            this._scheme[ this._schemeIndex ].lIndex = i - 1;
          }
        } else {
          this._scheme = null;
          return;
        }
        if ( params.catchFilled ) {
          this._loginInput && ( this._scheme.login = this._loginInput.value );
          this._passwordInput && ( this._scheme.password = this._passwordInput.value );
        }
        break;
      }
    }
    if ( !this._loginInput && !this._passwordInput ) {
      this._scheme = null;
      return;
    }
    this.updateSelects();
    this.updateCheckBoxes();
  }

  fillSchemeDOM( checkOnly = false ) {
    this.submitElem = null;
    if ( !this._allInputs.length ) {
      return Promise.resolve( this.loginSubmitted ? constants.SCHEME_WAIT_PASSWORD : constants.SCHEME_NOT_FOUND );
    }
    return this.fillCheckboxes( checkOnly ).then( () => {
      return this.fillSelects( checkOnly );
    } ).then( result => {
      result && this.collectInputs();
      return this.fillInputs( checkOnly );
    } ).then( result => {
      if (
        !checkOnly &&
        [
          constants.SCHEME_LOGIN_SUBMITTED,
          constants.SCHEME_AUTOSUBMIT_DONE
        ].includes( result )
      ) {
        if ( this._scheme[ this._schemeIndex ].submit ) {
          let tagName = Object.keys( this._scheme[ this._schemeIndex ].submit )[ 0 ];
          this.submitElem = ContentScript.getSubmit( tagName, this._scheme[ this._schemeIndex ].submit[ tagName ] );
        }
      }
      return result;
    } );
  }

  fillInputs( checkOnly ) {
    return new Promise( res => {
      let havePasswordInput = false,
        haveLoginInput = false;
      this._allInputs.forEach( input => {
        ContentScript.inputCanBeLogin( input ) && ( haveLoginInput = true );
        ContentScript.inputCanBePassword( input ) && ( havePasswordInput = true );
      } );
      if ( haveLoginInput && !havePasswordInput ) {
        this._schemeIndex = 1;
        if ( this.loginSubmitted ) return res( constants.SCHEME_WAIT_PASSWORD );
        if ( !this._scheme[ this._schemeIndex ] ) return res( constants.SCHEME_NOT_FOUND );
        if ( this._allInputs.length > 1 || !ContentScript.inputCanBeLogin( this._allInputs[ 0 ] ) ) {
          return res( constants.SCHEME_NOT_FOUND );
        }
        checkOnly || ContentScript.setInputValue( this._allInputs[ 0 ], this._scheme.login );
        return res( constants.SCHEME_LOGIN_SUBMITTED );
      } else if ( havePasswordInput && ( !haveLoginInput || this.loginSubmitted ) ) {
        this._schemeIndex = 2;
        for ( let i = 0; i < this._allInputs.length; i++ ) {
          if ( !ContentScript.inputCanBePassword( this._allInputs[ i ] ) ) continue;
          this._passwordInput = this._allInputs[ i ];
          if ( !this._scheme[ this._schemeIndex ] ) {
            this._scheme[ 2 ] = { pIndex: i };
            this.newSchemeFound();
          }
          checkOnly || ContentScript.setInputValue( this._passwordInput, this._scheme.password );
          break;
        }
        return res( constants.SCHEME_AUTOSUBMIT_DONE );
      }
      this._schemeIndex = 3;
      if ( !this._scheme[ this._schemeIndex ] ) {
        return res( constants.SCHEME_NOT_FOUND );
      }
      for ( let i = 0; i < this._allInputs.length; i++ ) {
        switch ( i ) {
          case this._scheme[ this._schemeIndex ].lIndex:
            if ( this.loginSubmitted ) continue;
            if ( !ContentScript.inputCanBeLogin( this._allInputs[ i ] ) ) {
              return res( constants.SCHEME_NOT_FOUND );
            }
            checkOnly || ContentScript.setInputValue( this._allInputs[ i ], this._scheme.login );
            break;
          case this._scheme[ this._schemeIndex ].pIndex:
            if ( !ContentScript.inputCanBePassword( this._allInputs[ i ] ) ) return res( constants.SCHEME_NOT_FOUND );
            checkOnly || ContentScript.setInputValue( this._allInputs[ i ], this._scheme.password );
            break;
        }
      }
      return res( constants.SCHEME_AUTOSUBMIT_DONE );
    } );
  }

  updateValues() {
    this._loginInput &&
    ContentScript.inViewPort( this._loginInput ) &&
    ( this._scheme.login = this._loginInput.value );
    this._passwordInput &&
    ContentScript.inViewPort( this._passwordInput ) &&
    ( this._scheme.password = this._passwordInput.value );
    this.updateCheckBoxes();
    return this._scheme;
  }

  updateCheckBoxes() {
    if ( !this._scheme[ this._schemeIndex ] ) return;
    for ( let i = 0; i < this._checkboxes.length; i++ ) {
      delete this._scheme[ this._schemeIndex ].checkboxes;
      if (
        ( this._loginInput && this._loginInput.form && this._loginInput.form !== this._checkboxes[ i ].form ) ||
        ( this._passwordInput && this._passwordInput.form && this._passwordInput.form !== this._checkboxes[ i ].form )
      ) continue;
      if (
        this._checkboxes[ i ].checked !== this._checkboxes[ i ].defaultChecked
      ) {
        this._scheme[ this._schemeIndex ].checkboxes ?
          this._scheme[ this._schemeIndex ].checkboxes[ i ] = this._checkboxes[ i ].checked :
          this._scheme[ this._schemeIndex ].checkboxes = { [ i ]: this._checkboxes[ i ].checked };
      }
    }
  }

  updateSelects() {
    if ( !this._scheme[ this._schemeIndex ] ) return;
    let i,
      j,
      defaultSelectedIndex;
    for ( i = 0; i < this._selects.length; i++ ) {
      if (
        ( this._loginInput && this._loginInput.form && this._loginInput.form !== this._selects[ i ].form ) ||
        ( this._passwordInput && this._passwordInput.form && this._passwordInput.form !== this._selects[ i ].form )
      ) continue;
      defaultSelectedIndex = 0;
      for ( j = 0; j < this._selects[ i ].options.length; j++ ) {
        if ( this._selects[ i ].options[ j ].defaultSelected ) {
          defaultSelectedIndex = j;
          break;
        }
      }
      if ( this._selects[ i ].selectedIndex !== defaultSelectedIndex ) {
        this._scheme[ this._schemeIndex ].selects ?
          this._scheme[ this._schemeIndex ].selects[ i ] = this._selects[ i ].selectedIndex :
          this._scheme[ this._schemeIndex ].selects = { [ i ]: this._selects[ i ].selectedIndex };
      }
    }
  }

  submit() {
    this._waitSubmitClicked = true;
    if ( this.submitElem ) {
      this.loginSubmitted = true;
      setTimeout( () => {
        this.submitElem.click();
        this.submitElem = null;
      }, constants.PAUSE_BEFORE_SUBMIT );
    } else return false;
    return true;
  }

  clickedOnEditableElement( target ) {
    if (
      this._loginInput === target ||
      this._passwordInput === target
    ) return true;
    let i;
    if ( this._selects ) {
      for ( i in this._selects ) {
        if ( !this._selects.hasOwnProperty( i ) ) continue;
        if ( this._selects[ i ] === target ) return true;
      }
    }
    if ( this._checkboxes ) {
      for ( i in this._checkboxes ) {
        if ( !this._checkboxes.hasOwnProperty( i ) ) continue;
        if ( this._checkboxes[ i ] === target ) return true;
      }
    }
    return false;
  }

  cancel() {
    this.hideQR();
    this._port && this._port.disconnect();
  }

  hideQR() {
    document.body.removeEventListener( 'click', this.cancel );
    this._QRImage && this._QRImage.remove();
  }

  showQR( imgSrc ) {
    this._QRImage = document.createElement( 'img' );
    this._QRImage.style.position = 'fixed';
    this._QRImage.style.top = 0;
    this._QRImage.style.right = 0;
    this._QRImage.style.zIndex = Number.MAX_SAFE_INTEGER;
    this._QRImage.style.border = '1px solid grey';
    this._QRImage.id = 'web0QRimage';
    this._QRImage.src = imgSrc;
    document.body.appendChild( this._QRImage );
    document.body.addEventListener( 'click', this.cancel );
  }

  static inputCanBeLogin( input ) {
    return [ 'text', 'email', 'number', 'tel' ].includes( input.type );
  }

  static inputCanBePassword( input ) {
    return [ 'password' ].includes( input.type );
  }

  static inputIsTyping( input ) {
    return [ 'password', 'text', 'email', 'url', 'number', 'tel' ].includes( input.type );
  }

  static inputIsCheckbox( input ) {
    return [ 'checkbox' ].includes( input.type );
  }

  static inputIsButton( input ) {
    return [ 'button', 'image', 'reset', 'submit' ].includes( input.type );
  }

  static inViewPort( el, params = { level: 0 } ) {
    if ( constants.VIEWPORT_SKIP_TAGS.includes( el.tagName ) ) return true;
    let styles = window.getComputedStyle( el );
    if (
      styles.display === 'none' ||
        styles.visibility === 'hidden' ||
        !parseInt( styles.opacity, 10 ) ||
        parseInt( styles.width, 10 ) < 10 ||
        ( !params.noHeightOk && parseInt( styles.height, 10 ) < 10 )
    ) return false;
    params.noHeightOk = [ 'left', 'right' ].includes( styles.float );
    let rect = el.getBoundingClientRect();
    const windowHeight = ( window.innerHeight || document.documentElement.clientHeight ),
      windowWidth = ( window.innerWidth || document.documentElement.clientWidth );
    let vertInView = ( rect.top <= windowHeight ) && ( rect.top + rect.height >= 0 ),
      horInView = ( rect.left <= windowWidth ) && ( rect.left + rect.width >= 0 );
    params.level++;
    return vertInView && horInView && ( !( el.parentNode instanceof Element ) ||
      ContentScript.inViewPort( el.parentNode, params ) );
  }

  static getSubmit( tagName, index ) {
    let allTags = document.body.getElementsByTagName( tagName );
    if ( allTags.length <= index ) return null;
    return allTags[ index ];
  }

  static setInputValue( input, value ) {
    input.focus();
    input.value = value || '';
    ContentScript.focusInput( input );
    ContentScript.fireKeyEvent( input, 'keydown' );
    ContentScript.fireKeyEvent( input, 'keypress' );
    ContentScript.fireKeyEvent( input, 'keyup' );
    ContentScript.fireEvent( input, 'input' );
    ContentScript.fireEvent( input, 'change' );
    input.blur();
  }

  static fireEvent( el, eventName ) {
    let ev = el.ownerDocument.createEvent( 'HTMLEvents' );
    ev.initEvent( eventName, true, true );
    el.dispatchEvent( ev );
  }

  static fireKeyEvent( el, eventName, keyCode = 0, key = '' ) {
    let evObj = {
      charCode: keyCode,
      keyCode: keyCode,
      which: keyCode
    };
    if ( key ) {
      evObj.code = key;
      evObj.char = key;
      evObj.key = key;
    }
    const ev = new KeyboardEvent( eventName, evObj );
    el.dispatchEvent( ev );
  }

  static focusInput( input ) {
    if ( !input ) return false;
    typeof input.click === 'function' && input.click();
    typeof input.focus === 'function' && input.focus();
    return typeof input.click === 'function' || typeof input.focus === 'function';
  }

  fillSelects( checkOnly ) {
    return new Promise( res => {
      if (
        checkOnly ||
        !this._scheme[ this._schemeIndex ] ||
        !this._scheme[ this._schemeIndex ].selects
      ) return res( false );
      let promises = [];
      for ( let i = 0; i < this._selects.length; i++ ) {
        this._scheme[ this._schemeIndex ].selects[ i ] && promises.push(
          ContentScript.setSelectValue( this._selects[ i ], this._scheme[ this._schemeIndex ].selects[ i ] )
        );
      }
      if ( !promises.length ) return res( false );
      return Promise.all( promises ).then( () => {
        res( true );
      } );
    } );
  }

  static setSelectValue( select, setIndex ) {
    select.focus();
    select.selectedIndex = setIndex;
    ContentScript.fireEvent( select, 'change' );
    select.blur();
    return new Promise( res => {
      setTimeout( () => {
        res();
      }, 0 );
    } );
  }

  fillCheckboxes( checkOnly ) {
    return new Promise( res => {
      if (
        checkOnly ||
        !this._scheme[ this._schemeIndex ] ||
        !this._scheme[ this._schemeIndex ].checkboxes
      ) return res();
      let promises = [];
      for ( let i = 0; i < this._checkboxes.length; i++ ) {
        this._scheme[ this._schemeIndex ].checkboxes[ i ] && promises.push(
          ContentScript.setCheckboxValue( this._checkboxes[ i ], this._scheme[ this._schemeIndex ].checkboxes[ i ] )
        );
      }
      return Promise.all( promises ).then( res );
    } );
  }

  static setCheckboxValue( checkbox, value ) {
    checkbox.focus();
    checkbox.checked = !!value;
    ContentScript.fireEvent( checkbox, 'click' );
    return new Promise( res => {
      setTimeout( res, 0 );
    } );
  }

  fillNewPassword( newPassword, oldPassword, login ) {
    if (
      !document.activeElement ||
      !ContentScript.inputCanBePassword( document.activeElement )
    ) return false;
    this.collectInputs();
    for ( let i = 0; i < this._allInputs.length; i++ ) {
      if ( this._allInputs[ i ] !== document.activeElement ) continue;
      ContentScript.setInputValue( this._allInputs[ i ], newPassword );
      this._allInputs[ i ].type = 'text';
      if (
        i < this._allInputs.length - 1 &&
        ContentScript.inputCanBePassword( this._allInputs[ i + 1 ] )
      ) {
        ContentScript.setInputValue( this._allInputs[ i + 1 ], newPassword );
        this._allInputs[ i + 1 ].type = 'text';
      } else if (
        i > 0 &&
        ContentScript.inputCanBePassword( this._allInputs[ i - 1 ] )
      ) {
        ContentScript.setInputValue( this._allInputs[ i - 1 ], newPassword );
        this._allInputs[ i - 1 ].type = 'text';
      }
      return this.resetSatet();
    }
    return false;
  }

}

const showMessage = message => {
  let myDiv = document.getElementById( 'Web0AlertDiv' );
  const opts = {
    property: 'top',
    delay: 0,
    duration: 400,
    start: -27,
    finish: 0,
    hideAfter: 5000
  };
  myDiv = document.createElement( 'DIV' );
  myDiv.id = 'Web0AlertDiv';
  myDiv.style.position = 'fixed';
  myDiv.style.width = '100%';
  myDiv.style.height = '27px';
  myDiv.style.display = 'block';
  myDiv.style.fontFamily = 'roboto, arial, sans-serif';
  myDiv.style.fontSize = '14px';
  myDiv.style.padding = '5px 0 0 0';
  myDiv.style.textAlign = 'center';
  myDiv.style.backgroundColor = '#f00';
  myDiv.style.zIndex = Number.MAX_SAFE_INTEGER.toString();
  myDiv.style.color = '#fff';
  myDiv.style.transitionProperty = opts.property;
  myDiv.style.transitionDelay = opts.delay + 'ms';
  myDiv.style.transitionTimingFunction = 'linear';
  myDiv.style.transitionDuration = opts.duration + 'ms';
  myDiv.style[ opts.property ] = opts.start + 'px';
  myDiv.innerHTML = message;
  document.body.appendChild( myDiv );
  myDiv.clientWidth;
  myDiv.style[ opts.property ] = opts.finish + 'px';
  setTimeout( () => {
    myDiv.style[ opts.property ] = opts.start + 'px';
    setTimeout( () => {
      myDiv.remove();
    }, opts.duration );
  }, opts.hideAfter );
};

window.Web0ContentScript = window.Web0ContentScript || new ContentScript();
