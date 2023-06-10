import WebSocket from 'faye-websocket';
import { expect } from 'chai';
import { rimraf } from 'rimraf';
import { deepScanDir, goLive } from '../src/index.js';
import { createTimer } from '../src/timer.js';
import { cpSync, writeFileSync } from 'node:fs';
import { WATCHER_PORT } from '../src/constants.js';

describe('Live test', function () {
  it('should clean', async () => {
    rimraf.sync('./test/fixtures');
    cpSync('./examples/test', './test/fixtures', { recursive: true });
  });

  it('should build', async () => {
    const timer = createTimer();
    const live = await goLive({
      root: './test/fixtures',
    });

    timer.tick();
    await live.build();
    timer.tick((dr) => console.log(`Build time: ${dr}ms`));

    const ls = deepScanDir('./test/fixtures/dist');
    expect(ls).to.include.members([
      'statics/img-from-public.png',
      'statics/index.html',
      'statics/parent/inside.html',
      'statics/pub-parent/inside-from-public.png',
      'statics/text-from-public.txt',
      'views/index.ejs',
      'views/mixed/top.ejs',
      'views/parent/inside.ejs',
    ]);
  });

  it('should watch', async () => {
    const live = await goLive({
      root: './test/fixtures',
    });

    let counter = 0;
    let client;

    await new Promise(async (resolve) => {
      await live.watch(async (dr) => {
        console.log(`Build time: ${dr}ms`);

        if (counter) {
          return resolve();
        }

        writeFileSync(
          './test/fixtures/src/new-added.html',
          '<img src="./parent/inside-img.png" />'
        );
        counter++;
      });

      client = new WebSocket.Client(`ws://localhost:${WATCHER_PORT}`);
      client.on('message', (event) => {
        console.log(event.data);
      });

      writeFileSync('./test/fixtures/src/new-added.ejs', 'new sample ejs');
    });

    await client.close();
    await live.close();

    rimraf.sync('./test/fixtures/src/new-added.ejs');
    rimraf.sync('./test/fixtures/src/new-added.html');

    const ls = deepScanDir('./test/fixtures/dist');
    expect(ls).to.include.members([
      'statics/img-from-public.png',
      'statics/index.html',
      'statics/new-added.html',
      'statics/parent/inside.html',
      'statics/pub-parent/inside-from-public.png',
      'statics/text-from-public.txt',
      'views/index.ejs',
      'views/mixed/top.ejs',
      'views/new-added.ejs',
      'views/parent/inside.ejs',
    ]);
  });
});
