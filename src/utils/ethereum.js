import { ethers } from 'ethers';
import { ABI } from '../constants/web0abi';
import { sha256blockchain } from './crypto';
import * as constants from '../constants/common';

export const createContractWeb0 = chainId => {
  let provider;
  switch ( chainId ) {
    case 1:
      provider = ethers.getDefaultProvider( 'homestead' );
      break;
    case 3:
      provider = ethers.getDefaultProvider( 'ropsten' );
      break;
    default:
      return null;
  }
  return new ethers.Contract(
    chainId === 3 ? constants.CONTRACT_ADDRESS_ROPSTEN : constants.CONTRACT_ADDRESS, ABI, provider
  );
};

export const getRecordsHashes = async ( chainId, alias, names ) => {
  let contract = createContractWeb0( chainId ),
    aliasHash = await sha256blockchain( alias );
  names = await Promise.all( names.map( x => { return sha256blockchain( x );} ) );
  return await contract.getHashes( aliasHash, names );
};
