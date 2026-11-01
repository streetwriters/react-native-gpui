import A from '@theme/MDXComponents/A';
import type { ComponentProps } from 'react';
import { getCoreBranchNameForCurrentVersion } from '../src/getCoreBranchNameForCurrentVersion';

type Props = ComponentProps<'a'>;

export default function RNRepoLink({ href, children, ...rest }: Props) {
  return (
    <A
      href={`https://github.com/react/react-native/blob/${getCoreBranchNameForCurrentVersion()}/${href.startsWith('/') ? href.slice(1) : href}`}
      {...rest}
    >
      {children}
    </A>
  );
}
