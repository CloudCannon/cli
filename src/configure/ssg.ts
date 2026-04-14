import type { SsgKey } from '@cloudcannon/configuration-types';
import { ssgs } from '@cloudcannon/gadget';
import type Ssg from '@cloudcannon/gadget/dist/ssgs/ssg.js';
import { getFilePaths, printJson } from '../utility.ts';

const ssgValues: Ssg[] = Object.values(ssgs);

/**
 * Detects the SSG from file paths and returns both the best match and all scores.
 */
export function detectSsg(filePaths: string[]): { ssg: SsgKey; scores: Record<SsgKey, number> } {
	const scores: Record<SsgKey, number> = {
		hugo: 0,
		jekyll: 0,
		eleventy: 0,
		nextjs: 0,
		astro: 0,
		sveltekit: 0,
		bridgetown: 0,
		lume: 0,
		mkdocs: 0,
		docusaurus: 0,
		gatsby: 0,
		hexo: 0,
		nuxtjs: 0,
		sphinx: 0,
		static: 0,
		legacy: 0,
		other: 0,
	};

	for (let i = 0; i < filePaths.length; i++) {
		for (let j = 0; j < ssgValues.length; j++) {
			scores[ssgValues[j].key] += ssgValues[j].getPathScore(filePaths[i]);
		}
	}

	const best = ssgValues.reduce(
		(previous, current) => (scores[previous.key] < scores[current.key] ? current : previous),
		ssgs.other
	);

	return {
		ssg: best.key,
		scores,
	};
}

export async function cmdDetectSsg(targetPath: string): Promise<void> {
	const filePaths = await getFilePaths(targetPath);

	printJson(detectSsg(filePaths));
}
