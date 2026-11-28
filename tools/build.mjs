// Builds the game into one classic script, dist/game.js, so that index.html opens by double-click; and packs
// the pictures the game names into dist/pictures.js, so that a page opened from the disk may read them.
// usage: node tools/build.mjs [--watch]
import { build, context } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

/** Writes dist/pictures.js: every picture of the registry, as a data address, by its path. */
async function packPictures() {
  // The registry is asked for its files: built on the spot, and run.
  const asked = await build({ stdin: { contents: "export { pictureFiles } from './src/level/kinds';", resolveDir: '.', loader: 'ts' }, bundle: true, format: 'esm', write: false, logLevel: 'silent' });
  const { pictureFiles } = await import('data:text/javascript;base64,' + Buffer.from(asked.outputFiles[0].text).toString('base64'));
  const lines = pictureFiles().sort().map(file => `  ${JSON.stringify('assets/' + file)}: "data:image/png;base64,${readFileSync('assets/' + file).toString('base64')}",`);
  writeFileSync('dist/pictures.js', '// The pictures of the game, packed by tools/build.mjs: a page opened from the disk may read pictures that\n// come in a script, and not those it fetches as files. See src/render/assets.ts.\nwindow.PICTURES = {\n' + lines.join('\n') + '\n};\n');
  console.log(`  dist/pictures.js  ${lines.length} pictures`);
}

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
  await packPictures();
}
