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
.dfm-toast{position:absolute;top:18px;left:50%;transform:translateX(-50%);max-width:min(520px,80vw);padding:8px 16px;background:rgba(11,14,18,.82);border:1px solid var(--ui-line);font-size:12px;letter-spacing:.08em;text-align:center;color:var(--ui-text)}
.dfm-toast[hidden]{display:none}
.dfm-modal-backdrop{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 42%,rgba(18,23,29,.92),rgba(5,6,8,.97));pointer-events:auto;animation:dfm-modal-fade .16s ease-out both}
.dfm-modal-backdrop[hidden]{display:none}
.dfm-modal{width:min(480px,90vw);max-height:84vh;overflow:auto;padding:22px 26px;background:var(--ui-surface);border:1px solid var(--ui-line);border-radius:4px;box-shadow:0 18px 60px rgba(0,0,0,.65)}
.dfm-modal-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:4px}
.dfm-modal-close{all:unset;cursor:pointer;color:var(--ui-dim);font-size:11px;letter-spacing:.14em;text-transform:uppercase;padding:6px 10px;border:1px solid var(--ui-line);border-radius:3px;transition:color .12s,border-color .12s}
.dfm-modal-close:hover,.dfm-modal-close:focus-visible{color:var(--ui-text);border-color:#3a4a5a;outline:none}
.dfm-inventory-list{list-style:none;margin:16px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
.dfm-item{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--ui-line);border-radius:3px;background:#101720}
.dfm-item-glyph{flex:none;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:3px;font-size:14px;background:#182130;border:1px solid var(--ui-line)}
.dfm-item-body{flex:1;min-width:0}
.dfm-item-name{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase}
.dfm-item-sub{display:block;margin-top:2px;font-size:10.5px;letter-spacing:.06em;color:var(--ui-dim)}
.dfm-item-qty{flex:none;font-size:11px;letter-spacing:.08em;color:var(--ui-dim)}
.dfm-item-use{flex:none;all:unset;cursor:pointer;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ui-focus);padding:6px 10px;border:1px solid var(--ui-focus);border-radius:3px}
.dfm-item-use:hover,.dfm-item-use:focus-visible{background:rgba(99,195,255,.12);outline:none}
.dfm-item[data-state=undiscovered]{opacity:.5}
.dfm-item[data-state=undiscovered] .dfm-item-glyph{background:transparent;border-style:dashed}
.dfm-item[data-state=collected]{border-color:#2f3f4e}
.dfm-item[data-state=collected] .dfm-item-glyph{color:var(--ui-focus);border-color:var(--ui-focus)}
.dfm-item[data-state=combined]{border-color:var(--ui-accent);background:#15110f}
.dfm-item[data-state=combined] .dfm-item-glyph{color:var(--ui-accent);border-color:var(--ui-accent)}
.dfm-item[data-state=combined] .dfm-item-name{text-decoration:line-through;text-decoration-color:rgba(215,224,232,.4)}
.dfm-inventory-empty{margin:18px 0 0;font-size:11.5px;letter-spacing:.06em;color:var(--ui-dim);text-align:center}
.dfm-keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:18px 0 14px}
.dfm-keypad button{all:unset;cursor:pointer;text-align:center;padding:14px 0;font:inherit;font-size:16px;letter-spacing:.06em;color:var(--ui-text);background:#101720;border:1px solid var(--ui-line);border-radius:3px;transition:background .1s,border-color .1s}
.dfm-keypad button:hover,.dfm-keypad button:focus-visible{background:#18212b;border-color:#3a4a5a;outline:none}
.dfm-keypad button[data-wide]{grid-column:span 1;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ui-dim)}
.dfm-password-display{display:flex;justify-content:center;gap:10px;margin:4px 0 2px}
.dfm-password-digit{width:30px;height:38px;display:flex;align-items:center;justify-content:center;border:1px solid var(--ui-line);border-radius:3px;background:#0e141a;font-size:18px;letter-spacing:.04em}
.dfm-password-digit[data-filled=true]{border-color:var(--ui-focus);color:var(--ui-focus)}
.dfm-password[data-shake=true] .dfm-password-display{animation:dfm-password-shake .32s ease}
.dfm-password-error{min-height:16px;margin:4px 0 0;font-size:11px;letter-spacing:.08em;text-align:center;color:var(--ui-accent);visibility:hidden}
.dfm-password-error[data-visible=true]{visibility:visible}
.dfm-feedback{position:absolute;bottom:20%;left:50%;transform:translate(-50%,6px);max-width:min(420px,70vw);padding:9px 16px;border-radius:3px;font-size:12px;letter-spacing:.08em;text-align:center;background:rgba(11,14,18,.86);border:1px solid var(--ui-line);opacity:0;transition:opacity .18s ease,transform .18s ease;pointer-events:none}
.dfm-feedback[data-visible=true]{opacity:1;transform:translate(-50%,0)}
.dfm-feedback[data-kind=success]{border-color:#2e6b4a;color:#9fe3bd}
.dfm-feedback[data-kind=error]{border-color:var(--ui-accent);color:#ff9b93}
.dfm-feedback[data-kind=info]{border-color:var(--ui-line);color:var(--ui-text)}
@keyframes dfm-modal-fade{from{opacity:0}to{opacity:1}}
@keyframes dfm-password-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
@media (max-width:560px){.dfm-modal{padding:16px}}
@media (prefers-reduced-motion:reduce){.dfm-modal-backdrop,.dfm-feedback{animation:none;transition:none}.dfm-password[data-shake=true] .dfm-password-display{animation:none}}
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