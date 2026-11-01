/**
 * The React Native version the desktop platform targets. Links into the React
 * Native repository use it, and not the version of these docs.
 */
export const REACT_NATIVE_VERSION = '0.87.1';

const [major, minor] = REACT_NATIVE_VERSION.split('.');

export const REACT_NATIVE_TEMPLATE_BRANCH = `${major}.${minor}-stable`;
