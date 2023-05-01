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
import { build as buildVite } from 'vite';
import chokidar from 'chokidar';

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

async function build(live) {
  const { srcPath, dstPath, staticPath, viewPath, publicPath } = live.config;

  // clean dst
  !existsSync(dstPath) && mkdirSync(dstPath, { recursive: true });

  existsSync(staticPath) && rimraf.sync(staticPath);
  existsSync(viewPath) && rimraf.sync(viewPath);

  if (existsSync(publicPath))
    cpSync(publicPath, staticPath, { recursive: true });
  else mkdirSync(staticPath);

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
      },
    },
    live.vite
  );
  await buildVite(viteConfig);

  // build .ejs.html
  const semiLs = ls.filter(matchExt('.ejs.html'));
  for (const name of semiLs) {
    const entry = join(viewPath, name);
    mkdirSync(dirname(entry), { recursive: true });
    renameSync(join(staticPath, name), join(dirname(entry), parse(entry).name));
  }
}

function watch(live, fn) {
  return new Promise(async (resolve) => {
    await build(live);

    const { srcPath, publicPath } = live.config;

    const watcher = chokidar.watch([srcPath, publicPath], {
      ignoreInitial: true,
    });
    const delayCall = createDelayCall(100);

    watcher.on('all', () => {
      delayCall(async () => {
        await build(live);
        await fn();
      });
    });

    watcher.on('ready', () => {
      resolve(watcher);
    });
  });
}

export function goLive(config) {
  const live = {};
  live.config = mergeDeepLeft(config, {
    src: 'src',
    public: 'public',
    dst: 'dist',
    static: 'statics',
    view: 'views',
  });

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

  live.vite = {
    mode: 'development',
    root: srcPath,
    publicDir: publicPath,
    build: {
      outDir: staticPath,
      emptyOutDir: true,
      minify: false,
    },
  };

  // before return
  live.build = () => build(live);
  live.watch = (fn) => watch(live, fn);

  return live;
}
