import { BOTS, runBot, type RunOptions, type RunResult } from './bots';

export interface SimRequest {
  bot: string;
  seed: number;
  options: RunOptions;
}
export interface SimResponse {
  bot: string;
  seed: number;
  result: RunResult;
}

/** Runs one bot/seed per message so the page stays responsive and can spread runs over several workers. */
self.onmessage = (e: MessageEvent<SimRequest>) => {
  const { bot, seed, options } = e.data;
  const policy = BOTS.find((b) => b.id === bot);
  if (!policy) return;
  const result = runBot(policy, { ...options, seed, ignoreAscension: false });
  (self as unknown as Worker).postMessage({ bot, seed, result } satisfies SimResponse);
};
