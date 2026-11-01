/**
 * Prefixes the site's base URL to root-relative `src` and `href` attributes of
 * raw JSX elements in MDX (`<img src="/docs/assets/x.svg" />`). Docusaurus
 * rewrites Markdown links and images itself but leaves these alone, so they
 * break when the site is served from a sub-path such as GitHub Pages.
 */
export default function remarkBaseUrl({ baseUrl }) {
  const prefix = baseUrl.replace(/\/$/, '');
  const rewrite = node => {
    if (
      (node.type === 'mdxJsxFlowElement' ||
        node.type === 'mdxJsxTextElement') &&
      Array.isArray(node.attributes)
    ) {
      for (const attribute of node.attributes) {
        if (
          (attribute.name === 'src' || attribute.name === 'href') &&
          typeof attribute.value === 'string' &&
          attribute.value.startsWith('/') &&
          !attribute.value.startsWith('//') &&
          !attribute.value.startsWith(`${prefix}/`)
        ) {
          attribute.value = prefix + attribute.value;
        }
      }
    }
    if (Array.isArray(node.children)) node.children.forEach(rewrite);
  };
  return tree => rewrite(tree);
}
