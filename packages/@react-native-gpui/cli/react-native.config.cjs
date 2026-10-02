const {execFileSync} = require('node:child_process');
const path = require('node:path');

const bin = path.join(__dirname, 'bin/rn-gpui.js');

module.exports = {
  commands: [
    {
      name: 'run-desktop',
      description: 'Build and launch the GPUI desktop target',
      func: async (_argv, _config, options) => {
        const args = ['run'];
        for (const [key, flag] of [
          ['entryFile', '--entry-file'],
          ['module', '--module'],
          ['appId', '--app-id'],
          ['bundle', '--bundle'],
        ]) {
          if (options[key] !== undefined) args.push(flag, String(options[key]));
        }
        execFileSync(process.execPath, [bin, ...args], {stdio: 'inherit'});
      },
      options: [
        {name: '--entry-file <path>', description: 'Application entry file'},
        {name: '--module <name>', description: 'React Native root module name'},
        {name: '--app-id <id>', description: 'Desktop application identifier'},
        {name: '--bundle <path>', description: 'Bundle output path'},
      ],
      examples: [{desc: 'Run the desktop target', cmd: 'npx react-native run-desktop'}],
    },
  ],
};
