import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fse from 'fs-extra';

// Get __dirname in ESM context
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse arguments
const [,, src, dest] = process.argv;

if (!src || !dest) {
  console.error('Usage: node copy-dir.mjs <source> <destination>');
  process.exit(1);
}

if (fse.existsSync(src))
{
	try {
		await fse.copy(src, dest, {
			dereference: true,
			preserveTimestamps: true,
			recursive: true,		
		});
		console.log(`Copied '${src}' to '${dest}' successfully.`);
	} catch (err) {
		console.error(`Error copying '${src}' to '${dest}':`, err);
		process.exit(1);
	}
}
