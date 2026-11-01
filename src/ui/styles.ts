const CSS = `
:root{--ui-bg:#0b0e12;--ui-surface:#141a21;--ui-line:#25303b;--ui-text:#d7e0e8;--ui-dim:#8d9aa7;--ui-accent:#ff3b30;--ui-focus:#63c3ff}
.dfm-ui{position:fixed;inset:0;font-family:ui-monospace,"SFMono-Regular",Menlo,monospace;color:var(--ui-text);pointer-events:none;z-index:20}
.dfm-ui *{box-sizing:border-box}
.dfm-screen{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:radial-gradient(circle at 50% 40%,rgba(20,26,33,.94),rgba(6,8,11,.98));pointer-events:auto}
.dfm-screen[hidden]{display:none}
.dfm-panel{min-width:min(460px,88vw);padding:26px 30px;background:var(--ui-surface);border:1px solid var(--ui-line);border-radius:4px;box-shadow:0 18px 60px rgba(0,0,0,.6)}
.dfm-title{margin:0 0 6px;font-size:26px;letter-spacing:.16em;text-transform:uppercase}
.dfm-sub{margin:0 0 20px;font-size:12px;letter-spacing:.22em;color:var(--ui-accent);text-transform:uppercase}
.dfm-btn{display:block;width:100%;margin:8px 0;padding:12px 16px;font:inherit;font-size:13px;letter-spacing:.14em;text-transform:uppercase;text-align:left;color:var(--ui-text);background:#101720;border:1px solid var(--ui-line);border-radius:3px;cursor:pointer;transition:background .12s,border-color .12s,transform .12s}
.dfm-btn:hover{background:#18212b;border-color:#3a4a5a}
.dfm-btn:focus-visible{outline:2px solid var(--ui-focus);outline-offset:2px}
.dfm-btn[disabled]{opacity:.45;cursor:not-allowed}
.dfm-row{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:12px 0;font-size:12px}
.dfm-row input[type=range]{flex:1;accent-color:var(--ui-accent)}
.dfm-hud{position:absolute;inset:0;pointer-events:none}
.dfm-objective{position:absolute;top:18px;left:18px;max-width:min(340px,42vw);padding:10px 14px;background:rgba(11,14,18,.72);border-left:2px solid var(--ui-accent);font-size:12px;line-height:1.5}
.dfm-objective .idx{color:var(--ui-dim);letter-spacing:.14em;font-size:10px;display:block;margin-bottom:4px}
.dfm-prompt{position:absolute;bottom:16%;left:50%;transform:translateX(-50%);padding:8px 16px;background:rgba(11,14,18,.82);border:1px solid var(--ui-line);font-size:12px;letter-spacing:.1em;text-transform:uppercase}
.dfm-prompt[hidden]{display:none}
.dfm-prompt kbd{padding:2px 6px;border:1px solid var(--ui-line);border-radius:3px;background:#1c252f;font:inherit}
.dfm-status{position:absolute;bottom:18px;left:18px;font-size:11px;color:var(--ui-dim);letter-spacing:.12em}
.dfm-threat{position:absolute;bottom:18px;right:18px;font-size:11px;letter-spacing:.12em;color:var(--ui-accent);opacity:0;transition:opacity .2s}
.dfm-threat[data-active=true]{opacity:1}
@media (max-width:900px){.dfm-title{font-size:20px}.dfm-panel{padding:18px}}
@media (prefers-reduced-motion:reduce){.dfm-btn{transition:none}}
`;

let injected = false;

export const injectStyles = (): void => {
  if (injected) return;
  injected = true;
  const tag = document.createElement('style');
  tag.dataset.dfm = 'ui';
  tag.textContent = CSS;
  document.head.appendChild(tag);
};