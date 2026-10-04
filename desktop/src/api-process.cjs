const { spawn } = require('node:child_process');
const net = require('node:net');
const { EventEmitter } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');

async function checkPort(origin) {
  const url = new URL(origin);
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error('로컬 API 포트가 사용 중입니다. 다른 앱을 확인하거나 ONFILM_LOCAL_PORT를 변경해 주세요.')));
    server.listen(Number(url.port), url.hostname, () => server.close(resolve));
  });
}

class ApiProcess extends EventEmitter {
  constructor(config, { timeoutMs = 90000, stopTimeoutMs = 12000 } = {}) {
    super();
    this.config = config;
    this.timeoutMs = timeoutMs;
    this.stopTimeoutMs = stopTimeoutMs;
    this.child = null;
    this.pending = null;
    this.ready = false;
    this.stopping = false;
  }

  start() {
    if (this.stopping) return Promise.reject(new Error('앱을 종료하고 있습니다.'));
    if (this.ready && this.child) return Promise.resolve();
    if (!this.pending) this.pending = this.launch().finally(() => { this.pending = null; });
    return this.pending;
  }

  async launch() {
    await checkPort(this.config.origin);
    if (this.stopping) throw new Error('앱을 종료하고 있습니다.');
    const child = spawn(this.config.command, this.config.args, {
      cwd: this.config.cwd, env: this.config.env, shell: false, windowsHide: true,
      // Logs stay in the invoking terminal. Never echo environment values or credentials.
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    this.child = child;
    let ended = false;
    let spawnFailed = false;
    this.closed = new Promise((resolve) => {
      child.once('error', () => { spawnFailed = true; });
      child.once('close', () => {
        ended = true;
        if (this.child === child) this.child = null;
        const wasReady = this.ready;
        this.ready = false;
        resolve();
        if (wasReady && !this.stopping) this.emit('failed', new Error('로컬 API가 종료됐습니다. 터미널의 서버 로그를 확인한 뒤 다시 연결해 주세요.'));
      });
    });
    try {
      const deadline = Date.now() + this.timeoutMs;
      while (Date.now() < deadline) {
        if (this.stopping) throw new Error('앱을 종료하고 있습니다.');
        if (spawnFailed) throw new Error('Java를 실행하지 못했습니다. Java 21 이상 또는 ONFILM_JAVA_PATH를 확인해 주세요.');
        if (ended) throw new Error('API 시작에 실패했습니다. 데이터 폴더 접근 권한과 터미널의 서버 로그를 확인해 주세요.');
        try {
          const response = await fetch(`${this.config.origin}/health/desktop`, {
            signal: AbortSignal.timeout(1000), redirect: 'error',
            headers: {'X-Onfilm-Token':this.config.env.ONFILM_TOKEN || ''},
          });
          const body = response.ok ? await response.json() : null;
          if (body?.service === 'onfilm-local' && body.instanceId === this.config.env.ONFILM_INSTANCE_ID
              && !ended && !this.stopping) {
            this.ready = true;
            return;
          }
        } catch { /* Wait for our own Spring instance, not just any open port. */ }
        await delay(150);
      }
      throw new Error('API 시작 제한 시간을 초과했습니다. 데이터 폴더와 서버 로그를 확인해 주세요.');
    } catch (error) {
      await this.terminateChild();
      throw error;
    }
  }

  async terminateChild() {
    const child = this.child;
    if (!child) return;
    child.kill('SIGTERM');
    let timer;
    await Promise.race([this.closed, new Promise((resolve) => {
      timer = setTimeout(resolve, this.stopTimeoutMs);
    })]);
    clearTimeout(timer);
    if (this.child === child) {
      this.forcedStop = true;
      child.kill('SIGKILL');
      await this.closed;
    }
  }

  async stop() {
    this.forcedStop = false;
    this.stopping = true;
    await this.terminateChild();
    await this.pending?.catch(() => {});
  }

  async resume() {
    if(this.child||this.pending)throw new Error('기존 API가 아직 종료되지 않았습니다.');
    this.stopping=false;return this.start();
  }
}

module.exports = { ApiProcess };
