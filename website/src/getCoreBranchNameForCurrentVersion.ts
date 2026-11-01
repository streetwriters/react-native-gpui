import { REACT_NATIVE_VERSION } from './reactNativeVersion';

export function getCoreBranchNameForCurrentVersion() {
  return `v${REACT_NATIVE_VERSION}`;
}
