import { copyFileSync, mkdirSync } from 'node:fs';

copyFileSync('dist-pages/game.js', 'game.js');
mkdirSync('dist', { recursive: true });
copyFileSync('dist-pages/game.js', 'dist/game.js');
