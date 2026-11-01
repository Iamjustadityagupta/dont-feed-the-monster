import {
  readFileSync,
  existsSync
} from 'node:fs';

import {
  join
} from 'node:path';

const manifestPath = join(
  'public',
  'audio',
  'MANIFEST.md'
);

if (!existsSync(manifestPath)) {
  console.error(
    'ERROR: public/audio/MANIFEST.md was not found.'
  );

  process.exit(1);
}

const manifest = readFileSync(
  manifestPath,
  'utf8'
);

const files = [
  ...manifest.matchAll(
    /\|\s*(\d+)\s*\|\s*([\w.-]+\.ogg)/g
  )
].map(match => match[2]);

let missing = 0;

for (const filename of files) {
  const exists = existsSync(
    join('public', 'audio', filename)
  );

  if (!exists) {
    missing++;
  }

  console.log(
    `${exists ? 'OK  ' : 'MISS'} ${filename}`
  );
}

console.log(
  `\n${files.length - missing}/${files.length} present, ` +
  `${missing} missing`
);

process.exitCode = missing > 0 ? 1 : 0;