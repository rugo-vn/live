import { expect } from 'chai';
import { rimraf } from 'rimraf';
import { deepScanDir, goLive } from '../src/index.js';
import { createTimer } from '../src/timer.js';
import { writeFileSync } from 'node:fs';

describe('Live test', function () {
  it('should clean', async () => {
    rimraf.sync('./test/fixtures/dist');
  });

  it('should build', async () => {
    const timer = createTimer();
    const live = goLive({
      root: './test/fixtures',
    });

    timer.tick();
    await live.build();
    timer.tick((dr) => console.log(`Build time: ${dr}ms`));

    const ls = deepScanDir('./test/fixtures/dist');
    expect(ls).to.has.members([
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
    const timer = createTimer();
    const live = goLive({
      root: './test/fixtures',
    });

    let counter = 0;
    timer.tick();

    await new Promise(async (resolve) => {
      const watcher = await live.watch(async () => {
        timer.tick((dr) => console.log(`Build time: ${dr}ms`));

        if (counter) {
          await watcher.close();
          return resolve();
        }

        writeFileSync(
          './test/fixtures/src/new-added.html',
          '<img src="./parent/inside-img.png" />'
        );
        counter++;
      });

      writeFileSync('./test/fixtures/src/new-added.ejs', 'new sample ejs');
    });

    rimraf.sync('./test/fixtures/src/new-added.ejs');
    rimraf.sync('./test/fixtures/src/new-added.html');

    const ls = deepScanDir('./test/fixtures/dist');
    expect(ls).to.has.members([
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
