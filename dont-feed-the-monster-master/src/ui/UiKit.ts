import { DisposableGroup, type Disposable } from '../core/Disposable';
import { injectStyles } from './styles';

export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export const button = (label: string, onClick: () => void, options: { disabled?: boolean } = {}): HTMLButtonElement => {
  const node = el('button', 'dfm-btn', label);
  node.type = 'button';
  node.disabled = options.disabled ?? false;
  node.addEventListener('click', onClick);
  return node;
};

export const screen = (name: string): HTMLDivElement => {
  const node = el('div', 'dfm-screen');
  node.dataset.screen = name;
  node.hidden = true;
  node.setAttribute('role', 'dialog');
  node.setAttribute('aria-modal', 'true');
  node.setAttribute('aria-label', name);
  return node;
};

export const panel = (): HTMLDivElement => el('div', 'dfm-panel');

/** Keeps Tab focus inside the screen while it is visible. */
export const createFocusTrap = (root: HTMLElement): Disposable => {
  const group = new DisposableGroup();
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>('button:not([disabled]),input,select,[tabindex]:not([tabindex="-1"])'),
    ).filter((node) => node.offsetParent !== null);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  root.addEventListener('keydown', onKeyDown);
  group.addFn(() => root.removeEventListener('keydown', onKeyDown));
  return group;
};

export const mountUiRoot = (): HTMLDivElement => {
  injectStyles();
  const root = el('div', 'dfm-ui');
  document.body.appendChild(root);
  return root;
};