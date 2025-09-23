import './loadman.js';
import { lookup as mimeLookup } from 'https://cdn.skypack.dev/mrmime';

window.tap = x => (console.log(x), x);

export let resolve = x => (typeof x === 'function' ? x() : x);

export function arrayify(x, opt = null) {
  if (Array.isArray(x)) return x;
  if (x === undefined || (opt === 'nonull' && x === null)) return [];
  return [x];
}

export function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

export let joinPath = window.joinPath = (path, name) => [...(path?.split?.('/') || []), name].filter(Boolean).join('/');

export async function selectFile(accept) {
  let { promise: p, resolve: res } = Promise.withResolvers();
  let input = d.el('input', { type: 'file', /*accept,*/ class: 'hidden' });
  input.addEventListener('change', ev => res(input.files[0]));
  top.document.body.append(input);
  input.click();
  input.remove();
  return p;
}

export function isMedia(path) {
  let type = mimeLookup(path);
  return type?.startsWith?.('image/') || type?.startsWith?.('video/') || type?.startsWith?.('audio/');
};

window.isMedia = isMedia;

class LoadingManager {
  ops = {};

  busy(k) {
    let { ops } = this;
    if (k) return ops[k]?.length || 0;
    return Object.values(ops).flat().length;
  }

  async run(k, fn, multi = false) {
    let { ops } = this;
    ops[k] ??= [];
    if (!multi && ops[k].length)
      throw new Error(`Operation already running: "${k}"`);
    ops[k].push(fn);
    d.update();
    try {
      await fn();
    } finally {
      ops[k].splice(ops[k].indexOf(fn), 1);
      if (!ops[k].length) delete ops[k];
      d.update();
    }
  }
}

export let loadman = window.loadman = new LoadingManager();
