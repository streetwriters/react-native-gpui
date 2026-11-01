---
id: getting-started
title: Introduction
description: This helpful guide lays out the prerequisites for learning React Native for desktop, using these docs, and setting up your environment.
---

Many different kinds of people use React Native: from advanced desktop and mobile developers to React beginners, to people getting started programming for the first time in their career. These docs were written for all learners, no matter their experience level or background.

react-native-gpui brings React Native to **macOS, Windows and Linux**. The core of React Native, its components, layout and APIs, is the same as everywhere else, so most of what you read in these docs applies to every React Native platform. Where desktop differs, the docs say so.

## How to use these docs

You can start here and read through these docs linearly like a book; or you can read the specific sections you need. Already familiar with React? You can skip [that section](https://reactnative.dev/docs/0.87/intro-react)—or read it for a light refresher.

## Prerequisites

To work with React Native, you will need to have an understanding of JavaScript fundamentals. If you’re new to JavaScript or need a refresher, you can [dive in](https://developer.mozilla.org/en-US/docs/Web/JavaScript) or [brush up](https://developer.mozilla.org/en-US/docs/Web/JavaScript/A_re-introduction_to_JavaScript) at Mozilla Developer Network.

:::info
While we do our best to assume no prior knowledge of React or of native desktop development, these are valuable topics of study for the aspiring React Native developer. Where sensible, we have linked to resources and articles that go more in depth.
:::

## Examples

The examples in these docs are complete components that you can paste into your own app. After [setting up your environment](set-up-your-environment) and [creating an app](environment-setup), replace the contents of `App.tsx` with an example and run `npx react-native run-desktop`:

```tsx
import { Text, View } from 'react-native';

const YourApp = () => {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Text>Try editing me! 🎉</Text>
    </View>
  );
};

export default YourApp;
```

Fast Refresh updates the running app as you save the file, so go ahead and try changing the "Try editing me!" text to "Hello, world!"

Next, get to know the foundation of React Native: [Native Components](https://reactnative.dev/docs/0.87/intro-react-native-components).
