import chokidar from 'chokidar';
import WebSocket from 'faye-websocket';
import { createServer } from 'node:http';
import { flatten, mergeDeepLeft } from 'ramda';
import { dirname, join, parse, resolve } from 'node:path';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
} from 'node:fs';
import { rimraf } from 'rimraf';
import { build as buildVite, loadConfigFromFile, loadEnv } from 'vite';
import { createTimer } from './timer.js';
import { ENV_PREFIX, WAIT, WATCHER_PORT } from './constants.js';

export function deepScanDir(dir) {
  const ls = readdirSync(dir);
  return flatten(
    ls.map((name) => {
      const entry = join(dir, name);

      if (statSync(entry).isDirectory())
        return deepScanDir(entry).map((childName) => join(name, childName));

      return name;
    })
  );
}

const createDelayCall = (delay) => {
  let timeout;

  return (fn, ...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      clearTimeout(timeout);
      fn(...args);
    }, delay);
  };
};

function matchExt(e) {
  e = e.replace(/\./g, '\\.');
  return (p) => new RegExp(`${e}$`, 'gi').test(p);
}

async function build(live, watch = false) {
  const { srcPath, dstPath, staticPath, viewPath, publicPath } = live.config;

  // clean dst
  !existsSync(dstPath) && mkdirSync(dstPath, { recursive: true });

  existsSync(staticPath) && rimraf.sync(staticPath);
  existsSync(viewPath) && rimraf.sync(viewPath);

  // if (existsSync(publicPath))
  //   cpSync(publicPath, staticPath, { recursive: true });
  // else mkdirSync(staticPath);

  mkdirSync(staticPath);
  mkdirSync(viewPath);

  // exit when not have source
  if (!existsSync(srcPath)) return;

  // scan html for build
  const ls = deepScanDir(srcPath);
  const htmlLs = ls.filter(matchExt('.html'));
  const ejsLs = ls.filter(matchExt('.ejs'));

  // copy ejs
  for (const name of ejsLs)
    cpSync(join(srcPath, name), join(viewPath, name), { recursive: true });

  // exit when not have any html
  if (htmlLs.length === 0) return;

  // build vite
  const inputBuilds = {};
  for (const name of htmlLs) inputBuilds[name] = join(srcPath, name);

  const viteConfig = mergeDeepLeft(
    {
      build: {
        rollupOptions: {
          input: inputBuilds,
        },
        ...(watch
          ? {
              watch: {
                buildDelay: WAIT,
              },
            }
          : {}),
      },
    },
    live.vite
  );

  const watcher = await new Promise(async (resolve) => {
    const watcher = await buildVite(viteConfig);
    let isResolve = false;

    if (!watch) return resolve(watcher);

    watcher.on('event', (event) => {
      if (event.code === 'BUNDLE_END' && !isResolve) {
        resolve(watcher);
        isResolve = true;
      }
    });
  });

  // build .ejs.html
  const semiLs = ls.filter(matchExt('.ejs.html'));
  for (const name of semiLs) {
    const entry = join(viewPath, name);
    mkdirSync(dirname(entry), { recursive: true });
    renameSync(join(staticPath, name), join(dirname(entry), parse(entry).name));
  }

  return watcher;
}

function watch(live, fn) {
  return new Promise(async (resolve) => {
    const { srcPath, publicPath } = live.config;
    const timer = createTimer();

    // web socket
    const server = createServer();
    let clients = [];

    server.addListener('upgrade', function (request, socket, head) {
      const ws = new WebSocket(request, socket, head);
      ws.onopen = function () {
        ws.send('connected');
      };
      if (WAIT > 0) {
        (function () {
          const wssend = ws.send;
          let waitTimeout;
          ws.send = function () {
            const args = arguments;
            if (waitTimeout) clearTimeout(waitTimeout);
            waitTimeout = setTimeout(function () {
              wssend.apply(ws, args);
            }, WAIT);
          };
        })();
      }
      ws.onclose = function () {
        clients = clients.filter(function (x) {
          return x !== ws;
        });
      };
      clients.push(ws);
    });

    server.listen(WATCHER_PORT);
    live.server = server;

    // build and watch
    timer.tick();
    live.viteWatcher = await build(live, true);
    timer.tick(async (dr) => {
      // reload
      for (let ws of clients) if (ws) ws.send('reload');
      // event
      await fn(dr);
    });

    // watcher
    const watcher = chokidar.watch([srcPath, publicPath], {
      ignoreInitial: true,
    });

    const delayCall = createDelayCall(WAIT);

    watcher.on('all', async () => {
      if (live.viteWatcher) {
        await live.viteWatcher.close();
        live.viteWatcher = null;
      }

      delayCall(async () => {
        timer.tick();
        live.viteWatcher = await build(live, true);
        timer.tick(async (dr) => {
          // reload
          for (let ws of clients) if (ws) ws.send('reload');
          // event
          await fn(dr);
        });
      });
    });

    watcher.on('ready', () => {
      live.watcher = watcher;
      resolve();
    });
  });
}

async function close({ watcher, server, viteWatcher }) {
  if (watcher) await watcher.close();
  if (server) await server.close();
  if (viteWatcher) await viteWatcher.close();
}

export async function goLive(config) {
  // config
  const live = {};
  live.config = mergeDeepLeft(config, {
    src: 'src',
    public: 'public',
    dst: 'dist',
    static: 'statics',
    view: 'views',
  });
  live.watcher = null;
  live.server = null;

  if (!live.config.root) throw new Error('Live must have root');

  const rootPath = resolve(live.config.root);
  const srcPath = join(rootPath, live.config.src);
  const publicPath = join(rootPath, live.config.public);
  const dstPath = join(rootPath, live.config.dst);
  const staticPath = join(dstPath, live.config.static);
  const viewPath = join(dstPath, live.config.view);

  live.config = mergeDeepLeft(
    { rootPath, srcPath, publicPath, dstPath, staticPath, viewPath },
    live.config
  );

  // vite
  let userConfig = {};
  const userConfigPath = join(rootPath, 'vite.config.js');
  if (existsSync(userConfigPath))
    userConfig = (await loadConfigFromFile({}, userConfigPath)).config;

  live.vite = mergeDeepLeft(userConfig, {
    mode: 'development',
    root: srcPath,
    publicDir: publicPath,
    build: {
      outDir: staticPath,
      emptyOutDir: true,
      minify: false,
    },
    envDir: rootPath,
    envPrefix: ENV_PREFIX,
  });

  // before return
  live.build = () => build(live);
  live.watch = (fn = new Function()) => watch(live, fn);
  live.close = () => close(live);

  return live;
}
