/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';

import Section from '../Section';
import SectionTitle from '../SectionTitle';
import { HelloWindow } from '../Illustrations';
import FoxFact from './FoxFact';

import styles from './styles.module.css';

function Platforms() {
  return (
    <Section>
      <SectionTitle
        title="Create native desktop apps for macOS, Windows, and Linux using React"
        description={
          <>
            react-native-gpui brings React Native to the desktop.
            <br />
            Write your app once in React and ship it as a native executable on
            every desktop platform.
          </>
        }
      />
      <div className={styles.platformsContainer}>
        <div className={styles.featureContainer}>
          <div className={styles.codeEditor}>
            <div className={styles.codeEditorTitleContainer}>App.tsx</div>
            <div className={styles.codeEditorContentContainer}>
              <pre>
                <span style={{ color: 'var(--home-code-red)' }}>function</span>{' '}
                <span style={{ color: 'var(--home-code-purple)' }}>App</span>
                {`() {`} <br />
                <span
                  style={{ color: 'var(--home-code-red)' }}
                >{`  return `}</span>
                {`(`} <br />
                {`    <`}
                <span style={{ color: 'var(--home-code-green)' }}>View</span>
                {` style={styles.root}>`} <br />
                {`      <`}
                <span style={{ color: 'var(--home-code-green)' }}>Logo</span>
                {` />`} <br />
                {`      <`}
                <span style={{ color: 'var(--home-code-green)' }}>Text</span>
                {`>`} <br />
                {`        Welcome to React Native`} <br />
                {`        on Desktop!`} <br />
                {`      </`}
                <span style={{ color: 'var(--home-code-green)' }}>Text</span>
                {`>`} <br />
                {`    </`}
                <span style={{ color: 'var(--home-code-green)' }}>View</span>
                {`>`} <br />
                {`  );`} <br />
                {`}`}
              </pre>
            </div>
          </div>
          <div className={styles.deviceContainer}>
            <HelloWindow className={styles.devices} />
          </div>
        </div>
      </div>
      <div className={styles.foxFactContainer}>
        <FoxFact className={styles.fox} />
        <p>
          <strong>Written in JavaScript, rendered on the GPU.</strong> React
          primitives are drawn by GPUI, a GPU-accelerated renderer written in
          Rust, while your app talks to the operating system through native
          modules.
        </p>
      </div>
    </Section>
  );
}

export default Platforms;
