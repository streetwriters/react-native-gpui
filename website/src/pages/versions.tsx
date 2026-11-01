/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';

import versions from '../../versions.json';

const repository = 'https://github.com/streetwriters/react-native-gpui';

const VersionItem = ({ version }: { version: string }) => {
  const isNext = version === 'next';
  const documentationUrl = useBaseUrl(
    `/docs/${isNext ? 'next/' : version === versions[0] ? '' : version + '/'}getting-started`,
  );
  const releaseNotesUrl = isNext
    ? `${repository}/commits/main`
    : `${repository}/releases`;

  return (
    <tr>
      <th>{isNext ? 'main' : version}</th>
      <td>
        <a href={documentationUrl}>Documentation</a>
      </td>
      <td>
        <a href={releaseNotesUrl}>{isNext ? 'Commits' : 'Changelog'}</a>
      </td>
    </tr>
  );
};

const VersionTable = ({ items }: { items: string[] }) => (
  <div className="table-wrapper">
    <table className="versions">
      <tbody>
        {items.map(version => (
          <VersionItem key={'version_' + version} version={version} />
        ))}
      </tbody>
    </table>
  </div>
);

const Versions = () => {
  const [latest, ...previous] = versions;

  return (
    <Layout title="Versions">
      <div className="versions-page">
        <h1>Docs Versions</h1>
        <p>
          The documentation is versioned by the React Native version the desktop
          platform targets.
        </p>
        <h2>Next version (Unreleased)</h2>
        <VersionTable items={['next']} />
        {latest && (
          <>
            <h2>Latest version</h2>
            <VersionTable items={[latest]} />
          </>
        )}
        {previous.length > 0 && (
          <>
            <h2>Previous versions</h2>
            <VersionTable items={previous} />
          </>
        )}
      </div>
    </Layout>
  );
};

export default Versions;
