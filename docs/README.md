# Documentation

These docs are ported from the [React Native documentation](https://github.com/facebook/react-native-website)
(`facebook/react-native-website`) and adapted for React Native on the desktop (macOS, Windows and
Linux). Page names, slugs, sidebar order and wording follow the upstream docs wherever the content
still applies; Android and iOS specific pages are replaced or removed, and desktop specific pages
are added.

The documentation content is © Meta Platforms, Inc. and is licensed under
[CC BY 4.0](../LICENSE-docs). Changes were made to adapt it to desktop. This project is not
affiliated with or endorsed by Meta. The site's code in [`website/`](../website) comes from the
same upstream repository under the MIT license ([`website/LICENSE`](../website/LICENSE)).

The site that renders these files lives in [`website/`](../website). Docs versions are cut with
`npm run version:cut` in that folder; `docs/` is the next, unreleased version.

## Building the site

The site has its own dependencies and is not part of the root npm workspaces:

```sh
cd website
npm ci
npm start        # dev server with live reload on http://localhost:3000
npm run build    # production build; broken links and anchors fail the build
npm run tsc      # type-check the site's code
```
