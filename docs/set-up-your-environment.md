---
id: set-up-your-environment
title: Set Up Your Environment
hide_table_of_contents: true
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import constants from '@site/core/TabsConstants';

import GuideMacOS from './\_getting-started-macos.md';
import GuideWindows from './\_getting-started-windows.md';
import GuideLinux from './\_getting-started-linux.md';

In this guide, you'll learn how to set up your environment, so that you can build and run React Native desktop apps on your own machine. A desktop app is a regular native executable for the operating system you develop on: you build macOS apps on a Mac, Windows apps on Windows, and Linux apps on Linux.

:::info
The first build of an app compiles the Rust renderer and takes a few minutes. Later builds are incremental. If the toolchain below is already installed, you should be up and running within a few minutes. Otherwise, expect about half an hour to install the compilers.
:::

#### Development OS

<Tabs groupId="os" queryString defaultValue={constants.defaultOs} values={constants.oses} className="pill-tabs">
<TabItem value="macos">

[//]: # 'macOS'

<GuideMacOS/>

</TabItem>
<TabItem value="windows">

[//]: # 'Windows'

<GuideWindows/>

</TabItem>
<TabItem value="linux">

[//]: # 'Linux'

<GuideLinux/>

</TabItem>
</Tabs>

## Next steps

Your environment is ready. Continue with [Get Started](getting-started) to create and run your first app.
