module.exports = async function () {
  const pid = Number(process.env.RN_GPUI_TEST_METRO_PID);
  if (!Number.isInteger(pid) || pid <= 1) return;
  try {
    if (process.platform === 'win32') {
      require('node:child_process').execFileSync('taskkill', [
        '/pid',
        String(pid),
        '/T',
        '/F',
      ]);
    } else process.kill(-pid, 'SIGTERM');
  } catch {}
  delete process.env.RN_GPUI_TEST_METRO_PID;
};
