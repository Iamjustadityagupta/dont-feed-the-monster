
import {
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from 'node:fs';

import { join, relative } from 'node:path';

const files = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);

    if (statSync(path).isDirectory()) {
      if (!['node_modules', '.git', 'dist'].includes(entry)) {
        walk(path);
      }
    } else {
      files.push(path);
    }
  }
}

walk('src');

const output = [
  '## PACKAGE.JSON',
  readFileSync('package.json', 'utf8'),
  '',
  '## SRC FILE TREE'
];

for (const file of files) {
  output.push(relative('.', file));
}

output.push('', '## CLASS AND FUNCTION DECLARATIONS');

for (const file of files.filter(f => /\.(ts|tsx)$/.test(f))) {
  const source = readFileSync(file, 'utf8');

  source.split('\n').forEach((line, index) => {
    if (
      /^\s*(export\s+)?(abstract\s+)?class\s+\w+/.test(line) ||
      /^\s*(export\s+)?(interface|type)\s+\w+/.test(line) ||
      /^\s*(public|private|protected)?\s*(async\s+)?(update|render|resize|dispose|setEnabled|onResize)\s*\(/.test(line)
    ) {
      output.push(`${file}:${index + 1}: ${line.trim()}`);
    }
  });
}

writeFileSync('project-dump.txt', output.join('\n'));

console.log(`Project inspection complete: ${files.length} files scanned.`);
console.log('Output saved to project-dump.txt');
