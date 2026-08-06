import fs from 'node:fs/promises';
import type { CommandDocumentation } from './command-documentation.ts';

// Force color on before the command modules load, so styled parts of
// descriptions can be detected and converted to markdown code spans.
process.env.FORCE_COLOR = '3';

const { documentCommand }: typeof import('./command-documentation.ts') = await import(
	'./command-documentation.ts'
);
const { main }: typeof import('../src/main.ts') = await import('../src/main.ts');

const outputPath: string = process.argv[2] ?? 'dist/documentation.json';
const documentation: CommandDocumentation = await documentCommand(main);
await fs.writeFile(outputPath, `${JSON.stringify(documentation, null, '\t')}\n`);
console.log(`Wrote CLI documentation to ${outputPath}`);
