/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type * as PluginContentDocs from '@docusaurus/plugin-content-docs';
import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';

import versions from './versions.json';
import prismThemeDark from './core/PrismThemeDark';
import prismThemeLight from './core/PrismThemeLight';

import remarkCodeblockLanguageTitle from './plugins/remark-codeblock-language-as-title';
import remarkBaseUrl from './plugins/remark-base-url.mjs';

const baseUrl = '/react-native-gpui/';
const repository = 'https://github.com/streetwriters/react-native-gpui';
const lastVersion = versions[0];
const copyright = `Documentation adapted from the <a href="https://reactnative.dev">React Native documentation</a>, © Meta Platforms, Inc., licensed under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. Changes were made. Not affiliated with or endorsed by Meta.`;

const commonDocsOptions: PluginContentDocs.Options = {
  admonitions: { keywords: ['important'], extendDefaults: true },
  breadcrumbs: false,
  showLastUpdateAuthor: false,
  showLastUpdateTime: true,
  editUrl: ({ docPath }) =>
    JSON.stringify([
      {
        label: 'Edit this page',
        href: `${repository}/edit/main/docs/${docPath}`,
      },
    ]),
  remarkPlugins: [remarkCodeblockLanguageTitle, [remarkBaseUrl, { baseUrl }]],
};

const config: Config = {
  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'throw',
      onBrokenMarkdownImages: 'throw',
    },
  },
  themes: [
    '@docusaurus/theme-mermaid',
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        indexBlog: false,
        docsRouteBasePath: ['docs', 'architecture'],
        docsDir: ['../docs', 'architecture'],
      },
    ],
  ],
  future: {
    v4: true,
    faster: (process.env.DOCUSAURUS_FASTER ?? 'true') === 'true',
  },

  title: 'react-native-gpui',
  tagline:
    'A framework for building native desktop apps for macOS, Windows and Linux using React',
  organizationName: 'streetwriters',
  projectName: 'react-native-gpui',
  url: 'https://streetwriters.github.io',
  baseUrl,
  trailingSlash: false,
  favicon: 'favicon.ico',
  titleDelimiter: '·',
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  presets: [
    [
      '@docusaurus/preset-classic',
      {
        docs: {
          path: '../docs',
          sidebarPath: require.resolve('./sidebars'),
          editCurrentVersion: true,
          exclude: [
            '**/README.md',
            '**/_*.{js,jsx,ts,tsx,md,mdx}',
            '**/*.test.{js,jsx,ts,tsx}',
            '**/__tests__/**',
          ],
          // The documentation is versioned like the packages: 0.87 is the
          // current version, for React Native 0.87.
          versions: {
            current: { label: '0.87', badge: false },
            ...(lastVersion ? { [lastVersion]: { badge: false } } : {}),
          },
          ...commonDocsOptions,
        },
        blog: {
          path: 'blog',
          blogSidebarCount: 'ALL',
          blogSidebarTitle: 'All Blog Posts',
          feedOptions: { type: 'all', copyright },
          onInlineAuthors: 'ignore',
        },
        theme: {
          customCss: [
            require.resolve('./src/css/customTheme.scss'),
            require.resolve('./src/css/index.scss'),
            require.resolve('./src/css/versions.scss'),
            require.resolve('./src/css/docs-secondary-nav.scss'),
          ],
        },
      } satisfies Preset.Options,
    ],
  ],
  plugins: [
    'docusaurus-plugin-sass',
    [
      'content-docs',
      {
        id: 'architecture',
        path: 'architecture',
        routeBasePath: '/architecture',
        sidebarPath: require.resolve('./sidebarsArchitecture'),
        ...commonDocsOptions,
        editUrl: ({ docPath }) =>
          JSON.stringify([
            {
              label: 'Edit this page',
              href: `${repository}/edit/main/website/architecture/${docPath}`,
            },
          ]),
      } satisfies PluginContentDocs.Options,
    ],
  ],
  themeConfig: {
    colorMode: {
      defaultMode: 'light',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    prism: {
      defaultLanguage: 'tsx',
      theme: prismThemeLight,
      darkTheme: prismThemeDark,
      additionalLanguages: [
        'diff',
        'bash',
        'powershell',
        'json',
        'rust',
        'toml',
        'cmake',
      ],
      magicComments: [
        {
          className: 'theme-code-block-highlighted-line',
          line: 'highlight-next-line',
          block: { start: 'highlight-start', end: 'highlight-end' },
        },
        {
          className: 'code-add-line',
          line: 'highlight-add-next-line',
          block: { start: 'highlight-add-start', end: 'highlight-add-end' },
        },
        {
          className: 'code-remove-line',
          line: 'highlight-remove-next-line',
          block: {
            start: 'highlight-remove-start',
            end: 'highlight-remove-end',
          },
        },
      ],
    },
    navbar: {
      title: 'react-native-gpui',
      logo: { src: 'img/header_logo.svg', alt: '' },
      style: 'dark',
      items: [
        {
          type: 'dropdown',
          label: 'Docs',
          position: 'right',
          items: [
            { label: 'Guides', to: '/docs/getting-started' },
            { label: 'Components', to: '/docs/components-and-apis' },
            { label: 'APIs', to: '/docs/accessibilityinfo' },
            { label: 'Architecture', to: '/architecture/overview' },
          ],
        },
        { to: '/versions', label: 'Versions', position: 'right' },
        { to: '/blog', label: 'Blog', position: 'right' },
        {
          href: repository,
          'aria-label': 'GitHub repository',
          position: 'right',
          className: 'navbar-github-link',
        },
      ],
    },
    image: 'img/logo-share.png',
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Develop',
          items: [
            { label: 'Guides', to: 'docs/getting-started' },
            { label: 'Components', to: 'docs/components-and-apis' },
            { label: 'APIs', to: 'docs/accessibilityinfo' },
            { label: 'Architecture', to: 'architecture/overview' },
          ],
        },
        {
          title: 'Find us',
          items: [
            { label: 'Blog', to: 'blog' },
            { label: 'GitHub', href: repository },
          ],
        },
        {
          title: 'Explore More',
          items: [
            { label: 'React Native', href: 'https://reactnative.dev/' },
            { label: 'React', href: 'https://react.dev/' },
          ],
        },
      ],
      copyright,
    },
    mermaid: {
      theme: { light: 'neutral', dark: 'dark' },
      options: {
        fontFamily:
          '"Optimistic Display", system-ui, -apple-system, sans-serif',
      },
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
