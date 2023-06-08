#!/usr/bin/env node

import process from 'node:process';
import { goLive } from './index.js';

const live = await goLive({
  root: process.cwd(),
});

await live.watch();
