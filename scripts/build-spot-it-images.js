// Development only: npm install --no-save --package-lock=false sharp
// Then: node scripts/build-spot-it-images.js /path/to/originals
// Keep originals outside this repository. The website only needs the WebP copies.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

async function main() {
  if (!process.argv[2]) throw new Error('Usage: node scripts/build-spot-it-images.js /path/to/originals');
  const source = path.resolve(process.argv[2]);
  const output = path.resolve(__dirname, '../media/spot_it/web');
  if (source === output) throw new Error('Choose an originals folder outside the web output folder.');
  const files = (await fs.readdir(source)).filter(file => /\.(png|jpe?g|webp)$/i.test(file));
  if (!files.length) throw new Error('No source images found in ' + source);
  await fs.mkdir(output, { recursive: true });
  let originalBytes = 0;
  let optimizedBytes = 0;
  // Sequential processing avoids decoding dozens of large originals at once.
  for (const file of files) {
    const input = path.join(source, file);
    const destination = path.join(output, file.replace(/\.[^.]+$/, '.webp'));
    originalBytes += (await fs.stat(input)).size;
    const info = await sharp(input).rotate()
      .resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 5 }).toFile(destination);
    optimizedBytes += info.size;
  }
  console.log(`${files.length} images: ${(originalBytes / 1048576).toFixed(1)} MB → ${(optimizedBytes / 1048576).toFixed(1)} MB`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
