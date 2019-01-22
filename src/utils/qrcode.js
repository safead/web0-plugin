import QRCode from 'qrcode';
export const QRCodeURL = value => {
  return new Promise( res => {
    QRCode.toDataURL( value, {
      color: {
        dark: '#000'
      }, width: 300
    }, ( err, url ) => {
      res( err ? '' : url );
    } );
  } );
};
