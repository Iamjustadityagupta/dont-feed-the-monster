
import { AudioBuses } from './AudioBuses';
import type { Channel } from './AudioBuses';

const ROWS: readonly {
  key: Channel;
  label: string;
}[] = [
  { key: 'master', label: 'MASTER' },
  { key: 'music', label: 'MUSIC' },
  { key: 'sfx', label: 'SFX' }
];

export class AudioSettingsPanel {
  private readonly el: HTMLDivElement;

  constructor(
    private readonly bus: AudioBuses,
    private readonly onOpenChange: (open: boolean) => void
  ) {
    this.el = document.createElement('div');

    this.el.style.cssText =
      'position:fixed;inset:0;z-index:70;display:none;' +
      'place-items:center;background:rgba(4,5,6,.9)';

    this.el.innerHTML = `
      <div style="
        width:min(420px,88vw);
        border:1px solid #262a2e;
        background:#0b0d0f;
        padding:26px 28px;
        font-family:ui-monospace,monospace
      ">
        <h2 style="
          margin:0 0 22px;
          font:700 11px/1 ui-monospace,monospace;
          letter-spacing:.28em;
          color:#8d8471
        ">AUDIO</h2>

        ${ROWS.map(row => `
          <label style="
            display:grid;
            grid-template-columns:84px 1fr 38px;
            gap:12px;
            align-items:center;
            margin-bottom:16px;
            color:#a8a08d;
            font-size:11px;
            letter-spacing:.18em
          ">
            ${row.label}

            <input
              type="range"
              min="0"
              max="100"
              value="${Math.round(this.bus.get(row.key) * 100)}"
              data-ch="${row.key}"
              style="accent-color:#c8a86a"
            >

            <output
              data-out="${row.key}"
              style="color:#6f6959;text-align:right"
            >${Math.round(this.bus.get(row.key) * 100)}</output>
          </label>
        `).join('')}

        <button
          data-close
          style="
            margin-top:10px;
            width:100%;
            background:none;
            border:1px solid #2c3034;
            color:#8d8471;
            padding:10px;
            font:600 11px/1 ui-monospace,monospace;
            letter-spacing:.22em;
            cursor:pointer
          "
        >CLOSE</button>
      </div>
    `;

    this.el
      .querySelectorAll<HTMLInputElement>('input[data-ch]')
      .forEach(input => {
        const channel = input.dataset.ch as Channel;

        input.addEventListener('input', () => {
          this.bus.set(
            channel,
            Number(input.value) / 100
          );

          const output =
            this.el.querySelector<HTMLOutputElement>(
              `[data-out="${channel}"]`
            );

          if (output) {
            output.textContent = input.value;
          }
        });
      });

    this.el
      .querySelector<HTMLButtonElement>('[data-close]')
      ?.addEventListener('click', this.close);

    document.body.appendChild(this.el);
  }

  get isOpen(): boolean {
    return this.el.style.display === 'grid';
  }

  open = (): void => {
    this.el.style.display = 'grid';
    this.onOpenChange(true);
  };

  close = (): void => {
    this.el.style.display = 'none';
    this.onOpenChange(false);
  };

  toggle = (): void => {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  };

  dispose = (): void => {
    this.close();
    this.el.remove();
  };
}
