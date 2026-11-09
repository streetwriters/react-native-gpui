const path = require('path');

const RUNTIME = path.join(__dirname, 'src', 'native-runtime.ts');
const TRANSFORMER = path.join(__dirname, 'metro-babel-transformer.cjs');
const EMBEDPDF = `${path.sep}node_modules${path.sep}@embedpdf${path.sep}`;

module.exports = function withPdfRuntime(config) {
  const previous = config.resolver && config.resolver.resolveRequest;
  const previousTransformer = config.transformer?.babelTransformerPath;
  if (previousTransformer) {
    process.env.RN_GPUI_PDF_BABEL_TRANSFORMER = previousTransformer;
  }
  return {
    ...config,
    transformer: { ...config.transformer, babelTransformerPath: TRANSFORMER },
    resolver: {
      ...config.resolver,
      resolveRequest(context, moduleName, platform) {
        if (moduleName === '@embedpdf/engine-runtime') {
          return { type: 'sourceFile', filePath: RUNTIME };
        }
        if (
          /@embedpdf\/engine-runtime-wasm32/u.test(moduleName) ||
          /embedpdf-worker\.source/u.test(moduleName)
        ) {
          return { type: 'empty' };
        }
        const next = previous || context.resolveRequest;
        const inside = context.originModulePath.includes(EMBEDPDF);
        if (moduleName === '#inline-transport' && inside) {
          return {
            type: 'sourceFile',
            filePath: require.resolve(
              '@embedpdf/engine/workers/inline-transport.node.js',
              { paths: [path.dirname(context.originModulePath)] },
            ),
          };
        }
        if (inside) {
          return next(
            { ...context, disableHierarchicalLookup: false },
            moduleName,
            platform,
          );
        }
        return next(context, moduleName, platform);
      },
    },
  };
};
