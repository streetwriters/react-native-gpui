/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';

import Head from '@docusaurus/Head';
import Layout from '@theme/Layout';

import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

import Home from '../components/Home';

const Index = () => {
  const { siteConfig } = useDocusaurusContext();
  const title = `${siteConfig.title} · ${siteConfig.tagline}`;
  return (
    <Layout description={siteConfig.tagline} wrapperClassName="homepage">
      <Head>
        <title>{title}</title>
        <meta property="og:title" content={title} />
        <meta property="twitter:title" content={title} />
      </Head>
      <Home />
    </Layout>
  );
};

export default Index;
