import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join, relative } from 'node:path';
import ignore, { type Ignore } from 'ignore';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
	'.html': 'text/html',
	'.js': 'application/javascript',
	'.mjs': 'application/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.txt': 'text/plain',
	'.md': 'text/markdown',
};

const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
	// images
	'.png',
	'.jpg',
	'.jpeg',
	'.gif',
	'.ico',
	'.webp',
	'.avif',
	'.bmp',
	'.tiff',
	'.tif',
	'.heic',
	'.heif',
	// fonts
	'.woff',
	'.woff2',
	'.ttf',
	'.otf',
	'.eot',
	// audio / video
	'.mp3',
	'.wav',
	'.ogg',
	'.flac',
	'.aac',
	'.m4a',
	'.mp4',
	'.webm',
	'.mov',
	'.avi',
	'.mkv',
	// archives / binaries
	'.zip',
	'.tar',
	'.gz',
	'.bz2',
	'.7z',
	'.rar',
	'.pdf',
	'.exe',
	'.dll',
	'.so',
	'.dylib',
	'.class',
	'.jar',
	'.wasm',
]);

export type FileInfo = { content?: string; file_size: number; last_modified: string };

export function getContentType(filepath: string): string {
	const ext = extname(filepath).toLowerCase();
	return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

export function isBinaryBuffer(buf: Buffer): boolean {
	const sample = buf.length > 8000 ? buf.subarray(0, 8000) : buf;
	return sample.includes(0);
}

export function isLikelyBinary(filepath: string): boolean {
	return BINARY_EXTENSIONS.has(extname(filepath).toLowerCase());
}

export function titleizeDirname(dir: string): string {
	const name = basename(dir);
	const words = name
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.split(/[_\-\s]+/)
		.filter(Boolean);
	if (words.length === 0) {
		return name;
	}
	return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

export async function getFileInfo(path: string): Promise<FileInfo> {
	const stats = await stat(path);

	let content: string | undefined;
	if (!isLikelyBinary(path)) {
		try {
			const buf = await readFile(path);
			if (!isBinaryBuffer(buf)) {
				content = buf.toString('utf8');
			}
		} catch {}
	}

	return { content, file_size: stats.size, last_modified: stats.mtime.toISOString() };
}

export async function getGitignorePatterns(
	cwd: string,
	outputPath: string
): Promise<Ignore | undefined> {
	const outputDir = relative(cwd, outputPath);
	try {
		const content = await readFile(join(cwd, '.gitignore'), 'utf-8');
		const patterns = content
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith('#'));
		patterns.push(`!${outputDir}`);
		return ignore().add(patterns);
	} catch {
		return;
	}
}

export async function listFiles(cwd: string, outputPath: string): Promise<string[]> {
	const files: string[] = [];
	const gitIgnore = await getGitignorePatterns(cwd, outputPath);

	async function walk(currentPath: string): Promise<void> {
		const entries = await readdir(currentPath, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(currentPath, entry.name);
			const relPath = relative(cwd, fullPath);
			if (relPath && gitIgnore?.ignores(relPath)) {
				continue;
			}
			if (entry.isFile()) {
				files.push(fullPath);
			} else if (entry.isDirectory()) {
				await walk(fullPath);
			}
		}
	}

	await walk(cwd);
	return files;
}
