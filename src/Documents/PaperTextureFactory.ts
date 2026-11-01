import * as THREE from 'three';

const WIDTH = 2048;
const HEIGHT = 2896;

type LetterSpacingContext = CanvasRenderingContext2D & {
  letterSpacing?: string;
};

function tornEdge(
  ctx: CanvasRenderingContext2D,
  inset: number
): void {
  const jitter = (n: number): number =>
    n + (Math.random() - 0.5) * 26;

  ctx.beginPath();
  ctx.moveTo(jitter(inset), jitter(inset));

  for (let y = inset; y < HEIGHT - inset; y += 34) {
    ctx.lineTo(jitter(inset), y);
  }

  for (let x = inset; x < WIDTH - inset; x += 34) {
    ctx.lineTo(x, jitter(HEIGHT - inset));
  }

  for (let y = HEIGHT - inset; y > inset; y -= 34) {
    ctx.lineTo(jitter(WIDTH - inset), y);
  }

  for (let x = WIDTH - inset; x > inset; x -= 34) {
    ctx.lineTo(x, jitter(inset));
  }

  ctx.closePath();
}

export interface PaperTextures {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
}

export function buildPaperTexture(
  page: string,
  pageNumber: number,
  pageCount: number
): PaperTextures {
  const canvas = document.createElement('canvas');

  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not create paper canvas context.');
  }

  ctx.fillStyle = '#cfc3a4';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const grain = ctx.getImageData(0, 0, WIDTH, HEIGHT);

  for (let i = 0; i < grain.data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 22;

    grain.data[i] += noise;
    grain.data[i + 1] += noise;
    grain.data[i + 2] += noise * 0.8;
  }

  ctx.putImageData(grain, 0, 0);

  // Old, dried blood: irregular spatter clusters and dragged smears, deliberately
  // matte so the paper reads as dirty evidence rather than a glowing UI element.
  for (let cluster = 0; cluster < 9; cluster++) {
    const cx = Math.random() * WIDTH;
    const cy = Math.random() * HEIGHT;
    const scale = 0.45 + Math.random() * 1.35;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.random() * Math.PI * 2);
    ctx.fillStyle = `rgba(${55 + Math.floor(Math.random()*35)},${8 + Math.floor(Math.random()*12)},${8 + Math.floor(Math.random()*10)},${0.16 + Math.random()*0.2})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, 85 * scale, 24 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let drop = 0; drop < 18; drop++) {
      const a = Math.random() * Math.PI * 2;
      const r = 25 + Math.random() * 175;
      const x = Math.cos(a) * r * scale;
      const y = Math.sin(a) * r * scale;
      const radius = (2 + Math.random() * 13) * scale;
      ctx.beginPath();
      ctx.ellipse(x, y, radius, radius * (0.55 + Math.random()), a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Finger grime, water tide marks and scuffed corners.
  for (let i = 0; i < 34; i++) {
    const x = Math.random() * WIDTH;
    const y = Math.random() * HEIGHT;
    const r = 18 + Math.random() * 110;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(35,29,20,0.12)');
    g.addColorStop(1, 'rgba(35,29,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x-r, y-r, r*2, r*2);
  }

  for (let i = 0; i < 26; i++) {
    const x = Math.random() * WIDTH;
    const y = Math.random() * HEIGHT;
    const radius = 20 + Math.random() * 150;

    const gradient = ctx.createRadialGradient(
      x, y, 0,
      x, y, radius
    );

    gradient.addColorStop(0, 'rgba(122,92,48,0.16)');
    gradient.addColorStop(1, 'rgba(122,92,48,0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(
      x - radius,
      y - radius,
      radius * 2,
      radius * 2
    );
  }

  ctx.strokeStyle = 'rgba(96,64,30,0.20)';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(
    WIDTH * 0.78,
    HEIGHT * 0.19,
    118,
    0.3,
    Math.PI * 1.9
  );
  ctx.stroke();

  for (const factor of [0.333, 0.666]) {
    const gradient = ctx.createLinearGradient(
      WIDTH * factor - 26,
      0,
      WIDTH * factor + 26,
      0
    );

    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.42, 'rgba(40,30,16,0.22)');
    gradient.addColorStop(0.5, 'rgba(255,250,235,0.35)');
    gradient.addColorStop(0.58, 'rgba(40,30,16,0.20)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(
      WIDTH * factor - 26,
      0,
      52,
      HEIGHT
    );
  }

  const horizontalGradient = ctx.createLinearGradient(
    0,
    HEIGHT * 0.5 - 22,
    0,
    HEIGHT * 0.5 + 22
  );

  horizontalGradient.addColorStop(0, 'rgba(0,0,0,0)');
  horizontalGradient.addColorStop(0.5, 'rgba(40,30,16,0.18)');
  horizontalGradient.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.fillStyle = horizontalGradient;
  ctx.fillRect(
    0,
    HEIGHT * 0.5 - 22,
    WIDTH,
    44
  );

  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  tornEdge(ctx, 14);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.restore();

  const vignette = ctx.createRadialGradient(
    WIDTH / 2,
    HEIGHT / 2,
    HEIGHT * 0.3,
    WIDTH / 2,
    HEIGHT / 2,
    HEIGHT * 0.78
  );

  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(58,42,20,0.30)');

  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const margin = 190;
  const maxWidth = WIDTH - margin * 2;

  let y = 250;

  for (const raw of page.split('\n')) {
    if (raw.trim() === '') {
      y += 34;
      continue;
    }

    const heading =
      raw === raw.toUpperCase() &&
      raw.trim().length > 3 &&
      raw.trim().length < 60;

    ctx.font = heading
      ? '600 52px Georgia, "Times New Roman", serif'
      : '400 42px Georgia, "Times New Roman", serif';

    ctx.fillStyle = heading
      ? 'rgba(28,22,14,0.92)'
      : 'rgba(38,30,20,0.88)';

    const spacing = ctx as LetterSpacingContext;

    if ('letterSpacing' in spacing) {
      spacing.letterSpacing = heading ? '2px' : '0px';
    }

    ctx.textBaseline = 'top';

    let line = '';

    for (const word of raw.split(' ')) {
      const test = line ? `${line} ${word}` : word;

      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, margin, y);
        y += 58;
        line = word;
      } else {
        line = test;
      }
    }

    ctx.fillText(line, margin, y);
    y += heading ? 76 : 58;

    if (y > HEIGHT - 240) break;
  }

  const spacing = ctx as LetterSpacingContext;

  if ('letterSpacing' in spacing) {
    spacing.letterSpacing = '0px';
  }

  ctx.font = '400 30px Georgia, serif';
  ctx.fillStyle = 'rgba(60,48,30,0.55)';
  ctx.textAlign = 'center';
  ctx.fillText(
    `${pageNumber} / ${pageCount}`,
    WIDTH / 2,
    HEIGHT - 150
  );
  ctx.textAlign = 'left';

  const map = new THREE.CanvasTexture(canvas);

  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;

  const bumpCanvas = document.createElement('canvas');

  bumpCanvas.width = 256;
  bumpCanvas.height = 362;

  const bumpContext = bumpCanvas.getContext('2d');

  if (!bumpContext) {
    map.dispose();
    throw new Error('Could not create paper bump-map context.');
  }

  const bumpImage = bumpContext.createImageData(256, 362);

  for (let i = 0; i < bumpImage.data.length; i += 4) {
    const value = 128 + (Math.random() - 0.5) * 90;

    bumpImage.data[i] = value;
    bumpImage.data[i + 1] = value;
    bumpImage.data[i + 2] = value;
    bumpImage.data[i + 3] = 255;
  }

  bumpContext.putImageData(bumpImage, 0, 0);

  const bump = new THREE.CanvasTexture(bumpCanvas);

  bump.wrapS = THREE.RepeatWrapping;
  bump.wrapT = THREE.RepeatWrapping;

  return { map, bump };
}