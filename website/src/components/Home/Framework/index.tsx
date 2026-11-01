/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';

import Section from '../Section';
import { ModulesCard, ShellCard, ToolsCard } from '../Illustrations';
import SectionTitle from '../SectionTitle';

import styles from './styles.module.css';

function Framework() {
  return (
    <Section>
      <SectionTitle
        title="Everything you need to ship a desktop app"
        description={
          <>
            React Native gives you the components. react-native-gpui adds the
            desktop: windows, menus, a tray, native modules, and the tooling to
            build and package your app for every platform.
          </>
        }
      />
      <div className={styles.cardContainer}>
        <div className={styles.card}>
          <ShellCard className={styles.cardImage} />
          <div className={styles.cardContent}>
            <h4 className={styles.cardTitle}>A real desktop shell</h4>
            <p className={styles.cardDescription}>
              Open multiple windows, build application and context menus,
              register keyboard shortcuts, and add a tray icon.
            </p>
          </div>
        </div>
        <div className={styles.card}>
          <ModulesCard className={styles.cardImage} />
          <div className={styles.cardContent}>
            <h4 className={styles.cardTitle}>Native modules in Rust or C++</h4>
            <p className={styles.cardDescription}>
              Write Turbo Native Modules in Rust or C++, or load Node addons,
              and call the operating system from JavaScript.
            </p>
          </div>
        </div>
        <div className={styles.card}>
          <ToolsCard className={styles.cardImage} />
          <div className={styles.cardContent}>
            <h4 className={styles.cardTitle}>Developer tools</h4>
            <p className={styles.cardDescription}>
              Run with <code>run-desktop</code>, get Fast Refresh through Metro,
              and open the dev menu. Package signed installers with{' '}
              <code>package-desktop</code>.
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}

export default Framework;
