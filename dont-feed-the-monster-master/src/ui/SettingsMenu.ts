
import { DisposableGroup, type Disposable } from '../core/Disposable';
import type { QualityLevel } from '../core/GameEvents';
import { button, el, panel, screen } from './UiKit';

export interface SettingsValues {
  mouseSensitivity: number;
  masterVolume: number;
  sfxVolume: number;
  ambienceVolume: number;
  quality: QualityLevel;
  reducedMotion: boolean;
}

export interface SettingsMenuActions {
  onChange: (patch: Partial<SettingsValues>) => void;
  onBack: () => void;
}

const range = (
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onInput: (value: number) => void,
): HTMLLabelElement => {
  const row = el('label', 'dfm-row');
  const input = el('input');

  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);

  input.addEventListener('input', () => {
    onInput(Number(input.value));
  });

  row.append(el('span', undefined, label), input);
  return row;
};

export class SettingsMenu implements Disposable {
  readonly root: HTMLDivElement;
  private readonly group = new DisposableGroup();
  private readonly backBtn: HTMLButtonElement;

  constructor(
    initial: SettingsValues,
    actions: SettingsMenuActions,
  ) {
    this.root = screen('Settings');

    const box = panel();
    box.append(el('h2', 'dfm-title', 'Settings'));

    box.append(
      range(
        'Mouse sensitivity',
        initial.mouseSensitivity,
        0.0004,
        0.01,
        0.0002,
        (value) => actions.onChange({ mouseSensitivity: value }),
      ),
      range(
        'Master volume',
        initial.masterVolume,
        0,
        1,
        0.05,
        (value) => actions.onChange({ masterVolume: value }),
      ),
      range(
        'SFX volume',
        initial.sfxVolume,
        0,
        1,
        0.05,
        (value) => actions.onChange({ sfxVolume: value }),
      ),
      range(
        'Ambience volume',
        initial.ambienceVolume,
        0,
        1,
        0.05,
        (value) => actions.onChange({ ambienceVolume: value }),
      ),
    );

    const qualityRow = el('label', 'dfm-row');
    const select = el('select');

    for (const level of ['low', 'medium', 'high'] as QualityLevel[]) {
      const option = el('option', undefined, level);
      option.value = level;
      option.selected = level === initial.quality;
      select.append(option);
    }

    select.addEventListener('change', () => {
      actions.onChange({
        quality: select.value as QualityLevel,
      });
    });

    qualityRow.append(el('span', undefined, 'Quality'), select);
    box.append(qualityRow);

    const motionRow = el('label', 'dfm-row');
    const motion = el('input');

    motion.type = 'checkbox';
    motion.checked = initial.reducedMotion;

    motion.addEventListener('change', () => {
      actions.onChange({
        reducedMotion: motion.checked,
      });
    });

    motionRow.append(el('span', undefined, 'Reduce motion'), motion);
    box.append(motionRow);

    this.backBtn = button('Back', actions.onBack);
    box.append(this.backBtn);
    this.root.append(box);
  }

  show(): void {
    this.root.hidden = false;
    this.backBtn.focus();
  }

  hide(): void {
    this.root.hidden = true;
  }

  dispose(): void {
    this.group.dispose();
    this.root.remove();
  }
}
