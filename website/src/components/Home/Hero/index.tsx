/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';

import Logo from '../Logo';
import GridBackground from './GridBackground';
import FloorBackground from './FloorBackground';
import HeroWindows from './HeroWindows';

import styles from './styles.module.css';

function Hero() {
  return (
    <div className={styles.container}>
      <div className={styles.socialLinks}>
        <a
          href="https://github.com/streetwriters/react-native-gpui"
          aria-label="react-native-gpui on GitHub"
        >
          GitHub
        </a>
      </div>
      <div className={styles.backgroundContainer}>
        <div className={styles.gridBackground}>
          <GridBackground />
        </div>
        <div className={styles.devices}>
          <HeroWindows
            className={styles.svgContent}
            sideClassName={styles.largeFormatDevices}
          />
        </div>
        <div className={styles.floorBackground}>
          <FloorBackground />
        </div>
      </div>
      <div className={styles.content}>
        <Logo />
        <h1 className={styles.title}>react-native-gpui</h1>
        <h2 className={styles.subtitle}>
          React Native for macOS, Windows, and Linux.
        </h2>
        <div className={styles.buttonContainer}>
          <a
            href={useBaseUrl('/docs/environment-setup')}
            className={styles.primaryButton}
          >
            Get Started
          </a>
          <a
            href={useBaseUrl('/docs/getting-started')}
            className={styles.secondaryButton}
          >
            Learn the Basics
          </a>
        </div>
      </div>
    </div>
  );
}

export default Hero;
