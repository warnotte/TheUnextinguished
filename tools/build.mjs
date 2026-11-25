// Builds the game into one classic script, dist/game.js, so that index.html opens by double-click.
// usage: node tools/build.mjs [--watch]
import { build, context } from 'esbuild';

const options = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  outfile: 'dist/game.js',
  sourcemap: true,
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('watching src/ and levels/ ...');
} else {
  await build(options);
}
