const { TestEnvironment } = require('jest-environment-node');
const path = require('node:path');

module.exports = class DesktopEnvironment extends TestEnvironment {
  async setup() {
    await super.setup();
    this.apps = new Set();
    this.global.__RN_GPUI_REGISTER_TEST_APP__ = app => this.apps.add(app);
  }

  async handleTestEvent(event) {
    if (event.name !== 'test_done') return;
    for (const app of this.apps) {
      try {
        app.assertNoErrors();
      } catch (error) {
        event.test.errors.push(error);
      }
    }
    if (!event.test.errors.length) return;
    const name = event.test.name.replace(/[^a-z0-9_-]/giu, '_');
    await Promise.all(
      [...this.apps].map((app, index) =>
        app.saveArtifacts(
          path.resolve(
            '.local/test-artifacts',
            `worker-${process.env.JEST_WORKER_ID ?? '1'}`,
            `${name}-${index}`,
          ),
        ),
      ),
    );
  }

  async teardown() {
    await Promise.all(
      [...this.apps].map(app =>
        process.env.RN_GPUI_TEST_KEEP_APP === '1'
          ? app.disconnect()
          : app.close(),
      ),
    );
    await super.teardown();
  }
};
