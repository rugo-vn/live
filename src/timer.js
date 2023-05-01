import process from 'node:process';

function tickTimer(timer, fn) {
  const top = timer.stops[timer.stops.length - 1];
  const now = process.hrtime.bigint();

  timer.stops.push(now);
  if (fn) {
    fn(Number(now - top) / 1000000);
  }
}

export function createTimer() {
  const timer = {
    stops: [process.hrtime.bigint()],
  };

  timer.tick = (fn) => tickTimer(timer, fn);

  return timer;
}
