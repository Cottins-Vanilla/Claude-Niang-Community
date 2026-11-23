// Reference prices for the usage ledger, in US dollars per million tokens, from
// Anthropic's first-party API price list (models table, cached 2026-11-03).
// A reference figure only: a Claude subscription is not billed per token.
//
// Cache writes: 5-minute 1.25x input, 1-hour 2x input. Cache reads differ by
// model and are listed per model. Fast mode costs 2x on every model that has it.
// Models missing from this table stay unpriced rather than guessed.

const P=(input,output,cacheRead,extra={})=>({input,output,cacheRead,...extra});
export const PRICES={
  'claude-fable-5-2':P(8,40,0.20),
  'claude-mythos-5-2':P(8,40,0.20),
  'claude-fable-5-1':P(10,50,0.25),
  'claude-mythos-5-1':P(10,50,0.25),
  'claude-fable-5':P(10,50,1.00),
  'claude-mythos-5':P(10,50,1.00),
  'claude-opus-5-5':P(4,20,0.20),
  'claude-opus-5':P(5,25,0.50),
  'claude-opus-4-8':P(5,25,0.50),
  'claude-opus-4-7':P(5,25,0.50),
  'claude-opus-4-6':P(5,25,0.50),
  'claude-sonnet-5-5':P(2,10,0.10),
  'claude-sonnet-5':P(2,10,0.20),
  'claude-sonnet-4-6':P(3,15,0.30),
  // Haiku 5.5 has two price cards, chosen by the prompt's length.
  'claude-haiku-5-5':P(0.10,0.50,0.01,{longPrompt:{over:100000,input:0.50,output:2.50,cacheRead:0.05}}),
  'claude-haiku-4-5':P(1,5,0.10)
};
export const PRICE_SOURCE='Anthropic API 公开价格（2026-11-03）';

// claude-sonnet-4-5-20250929 → claude-sonnet-4-5; unknown ids stay as they are.
export function priceKey(model) {
  const id=String(model??'').toLowerCase().replace(/-\d{8}$/,'').replace(/@\d{8}$/,'');
  return Object.hasOwn(PRICES,id)?id:null;
}

// Cost of one reply. usage: {input, output, cacheWrite5m, cacheWrite1h, cacheRead, fast}.
// Returns null when the model has no price.
export function replyCost(model,usage) {
  const key=priceKey(model);
  if(!key)return null;
  let card=PRICES[key];
  const prompt=(usage.input||0)+(usage.cacheWrite5m||0)+(usage.cacheWrite1h||0)+(usage.cacheRead||0);
  if(card.longPrompt && prompt>card.longPrompt.over)card={...card,...card.longPrompt};
  const speed=usage.fast?2:1;
  const dollars=((usage.input||0)*card.input+(usage.output||0)*card.output+(usage.cacheWrite5m||0)*card.input*1.25+(usage.cacheWrite1h||0)*card.input*2+(usage.cacheRead||0)*card.cacheRead)/1e6;
  return dollars*speed;
}
