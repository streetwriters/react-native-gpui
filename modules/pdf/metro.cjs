const path = require('path');

const RUNTIME = path.join(__dirname, 'src', 'native-runtime.ts');

module.exports = function withPdfRuntime(config) {
  const previous = config.resolver && config.resolver.resolveRequest;
  return {
    ...config,
    resolver: {
      ...config.resolver,
      resolveRequest(context, moduleName, platform) {
        if (moduleName === '@embedpdf/engine-runtime') {
          return { type: 'sourceFile', filePath: RUNTIME };
        }
        return (previous || context.resolveRequest)(
          context,
          moduleName,
          platform,
        );
      },
    },
  };
};
