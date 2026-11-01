/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';

import Section from '../Section';
import { ComponentAnatomy } from '../Illustrations';
import SectionTitle from '../SectionTitle';

import styles from './styles.module.css';

function Native() {
  return (
    <Section>
      <SectionTitle
        title="One renderer, every desktop"
        description={
          <>
            react-native-gpui draws your app with one GPU-accelerated renderer
            on macOS, Windows, and Linux, so it looks and behaves the same
            everywhere. It provides the core components you know, like{' '}
            <code>View</code>, <code>Text</code>, and <code>Image</code>, plus
            desktop features like windows, menus, and keyboard shortcuts.
          </>
        }
      />
      <ComponentAnatomy className={styles.flyoutIllustration} />
    </Section>
  );
}

export default Native;
