import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	extractEditorLinks,
	type LinkContext,
	resolveEditorLink,
} from '../../src/configure/editor-links.ts';

function context(overrides: Partial<LinkContext> = {}): LinkContext {
	return {
		collections: new Map([
			[
				'pages',
				{
					key: 'pages',
					path: 'src/content/pages',
					schemas: ['default'],
					enabledEditors: ['visual'],
				},
			],
			['data', { key: 'data', path: 'data', schemas: [] }],
		]),
		source: '',
		fileExists: (repoPath: string): boolean =>
			['src/content/pages/index.md', 'data/pricing.json'].includes(repoPath.replace(/^\/+/, '')),
		...overrides,
	};
}

describe('extractEditorLinks', () => {
	it('returns nothing for strings without the protocol', () => {
		assert.deepEqual(extractEditorLinks('just some help text'), []);
		assert.deepEqual(extractEditorLinks(''), []);
	});

	it('extracts a bare href value', () => {
		assert.deepEqual(extractEditorLinks('cloudcannon:collections/pages'), [
			'cloudcannon:collections/pages',
		]);
	});

	it('extracts links embedded in markdown, stopping at the closing paren', () => {
		assert.deepEqual(
			extractEditorLinks('See [the home page](cloudcannon:collections/pages/index.md) now'),
			['cloudcannon:collections/pages/index.md']
		);
	});

	it('keeps entity-encoded query strings intact', () => {
		assert.deepEqual(
			extractEditorLinks(
				'[x](cloudcannon:collections/pages:/edit?collection=pages&amp;path=%2Fa.md)'
			),
			['cloudcannon:collections/pages:/edit?collection=pages&amp;path=%2Fa.md']
		);
	});

	it('extracts multiple links from one string', () => {
		assert.equal(
			extractEditorLinks('[a](cloudcannon:collections/pages) and [b](cloudcannon:collections/data)')
				.length,
			2
		);
	});

	it('keeps bracketed (dynamic-route) filenames intact', () => {
		assert.deepEqual(extractEditorLinks('Edit cloudcannon:collections/pages/[slug].md now'), [
			'cloudcannon:collections/pages/[slug].md',
		]);
	});

	it('trims trailing prose punctuation from a bare link', () => {
		assert.deepEqual(extractEditorLinks('Browse the team at cloudcannon:collections/staff.'), [
			'cloudcannon:collections/staff',
		]);
	});

	it('preserves spaces inside a quoted href (bounded by the closing quote)', () => {
		assert.deepEqual(
			extractEditorLinks('<a href="cloudcannon:collections/posts:/edit?path=/a (1).md">'),
			['cloudcannon:collections/posts:/edit?path=/a (1).md']
		);
	});

	it('does not emit anything for the bare word "cloudcannon:" in prose', () => {
		assert.deepEqual(extractEditorLinks('The cloudcannon: protocol is neat'), []);
	});

	it('detects the scheme case-insensitively but normalises it', () => {
		assert.deepEqual(extractEditorLinks('Cloudcannon:collections/pages'), [
			'cloudcannon:collections/pages',
		]);
	});

	it('keeps balanced parens inside a markdown link', () => {
		assert.deepEqual(extractEditorLinks('[x](cloudcannon:edit?path=/data/list(1).json)'), [
			'cloudcannon:edit?path=/data/list(1).json',
		]);
	});

	it('does not match the scheme mid-word', () => {
		assert.deepEqual(extractEditorLinks('xcloudcannon:collections/foo'), []);
	});

	it('terminates an unquoted attribute at the closing angle bracket', () => {
		assert.deepEqual(extractEditorLinks('<a href=cloudcannon:collections/foo>'), [
			'cloudcannon:collections/foo',
		]);
	});
});

describe('resolveEditorLink — collection/file routes', () => {
	it('accepts browsing a collection by key', () => {
		assert.equal(resolveEditorLink('cloudcannon:collections/pages', context()), undefined);
	});

	it('accepts a link to a real repository path', () => {
		assert.equal(
			resolveEditorLink('cloudcannon:collections/src/content/pages/index.md', context()),
			undefined
		);
	});

	it('flags the collection-relative-path mistake (the folder-listing bug)', () => {
		const finding = resolveEditorLink('cloudcannon:collections/pages/index.md', context());
		assert.equal(finding?.level, 'error');
		assert.match(finding?.message ?? '', /is a collection, but/);
	});

	it('flags an unknown collection with no matching file', () => {
		const finding = resolveEditorLink('cloudcannon:collections/blog', context());
		assert.equal(finding?.level, 'error');
		assert.match(finding?.message ?? '', /no collection named/);
	});
});

describe('resolveEditorLink — explicit edit routes', () => {
	const good =
		'cloudcannon:collections/pages:/edit?collection=pages&path=%2Fsrc%2Fcontent%2Fpages%2Findex.md&schema=default&editor=visual&url=%2F';

	it('accepts a well-formed edit link', () => {
		assert.equal(resolveEditorLink(good, context()), undefined);
	});

	it('accepts the entity-encoded (&amp;) form', () => {
		assert.equal(resolveEditorLink(good.replace(/&/g, '&amp;'), context()), undefined);
	});

	it('errors on an unknown collection param', () => {
		const finding = resolveEditorLink(
			'cloudcannon:collections/x:/edit?collection=nope&path=%2Fsrc%2Fcontent%2Fpages%2Findex.md',
			context()
		);
		assert.equal(finding?.level, 'error');
		assert.match(finding?.message ?? '', /unknown collection/);
	});

	it('errors on a missing target file', () => {
		const finding = resolveEditorLink(
			'cloudcannon:collections/pages:/edit?collection=pages&path=%2Fsrc%2Fcontent%2Fpages%2Fmissing.md',
			context()
		);
		assert.equal(finding?.level, 'error');
		assert.match(finding?.message ?? '', /file not found/);
	});

	it('errors on an unknown schema when the collection defines schemas', () => {
		const finding = resolveEditorLink(
			'cloudcannon:collections/pages:/edit?collection=pages&path=%2Fsrc%2Fcontent%2Fpages%2Findex.md&schema=nope',
			context()
		);
		assert.equal(finding?.level, 'error');
		assert.match(finding?.message ?? '', /unknown schema/);
	});

	it('errors on an invalid editor value', () => {
		const finding = resolveEditorLink(
			'cloudcannon:collections/pages:/edit?collection=pages&path=%2Fsrc%2Fcontent%2Fpages%2Findex.md&editor=wysiwyg',
			context()
		);
		assert.equal(finding?.level, 'error');
		assert.match(finding?.message ?? '', /invalid editor/);
	});

	it('warns when the editor is valid but not enabled for the collection', () => {
		const finding = resolveEditorLink(
			'cloudcannon:collections/pages:/edit?collection=pages&path=%2Fsrc%2Fcontent%2Fpages%2Findex.md&editor=data',
			context()
		);
		assert.equal(finding?.level, 'warning');
		assert.match(finding?.message ?? '', /not in _enabled_editors/);
	});

	it('warns when an edit link has no path to verify', () => {
		const finding = resolveEditorLink(
			'cloudcannon:collections/pages:/edit?collection=pages&editor=visual',
			context()
		);
		assert.equal(finding?.level, 'warning');
		assert.match(finding?.message ?? '', /no path parameter/);
	});

	it('does not warn about a missing path on a create route', () => {
		assert.equal(
			resolveEditorLink('cloudcannon:collections/pages:/create?collection=pages', context()),
			undefined
		);
	});

	it('accepts the app’s legacy editor aliases but flags them as deprecated (info)', () => {
		for (const editor of ['explore', 'update', 'browser', 'code']) {
			const finding = resolveEditorLink(
				`cloudcannon:collections/data:/edit?collection=data&path=%2Fdata%2Fpricing.json&editor=${editor}`,
				context()
			);
			assert.equal(finding?.level, 'info', `editor=${editor} should be an info notice`);
			assert.match(finding?.message ?? '', /legacy alias/);
		}
	});

	it('does not flag a canonical (non-alias) editor', () => {
		assert.equal(
			resolveEditorLink(
				'cloudcannon:collections/data:/edit?collection=data&path=%2Fdata%2Fpricing.json&editor=data',
				context()
			),
			undefined
		);
	});

	it('picks the last value when a query param is repeated (matches the app)', () => {
		assert.match(
			resolveEditorLink(
				'cloudcannon:collections/pages:/edit?collection=pages&collection=bogus&path=%2Fsrc%2Fcontent%2Fpages%2Findex.md',
				context()
			)?.message ?? '',
			/unknown collection "bogus"/
		);
		assert.equal(
			resolveEditorLink(
				'cloudcannon:collections/pages:/edit?collection=bogus&collection=pages&path=%2Fsrc%2Fcontent%2Fpages%2Findex.md',
				context()
			),
			undefined
		);
	});

	it('handles a bare edit? route (no collections/ prefix)', () => {
		assert.equal(
			resolveEditorLink(
				'cloudcannon:edit?collection=pages&path=%2Fsrc%2Fcontent%2Fpages%2Findex.md',
				context()
			),
			undefined
		);
		const finding = resolveEditorLink('cloudcannon:edit?collection=nope&path=%2Fx.md', context());
		assert.equal(finding?.level, 'error');
		assert.match(finding?.message ?? '', /unknown collection/);
	});

	it('decodes + to space in query values', () => {
		const ctx = context({ fileExists: (p: string): boolean => p.replace(/^\/+/, '') === 'a b.md' });
		assert.equal(
			resolveEditorLink('cloudcannon:collections/pages:/edit?collection=pages&path=%2Fa+b.md', ctx),
			undefined
		);
	});
});

describe('resolveEditorLink — skipped and warned forms', () => {
	it('skips the empty body from a bare "cloudcannon:" in prose', () => {
		assert.equal(resolveEditorLink('cloudcannon:', context()), undefined);
	});

	it('skips template-placeholder links', () => {
		assert.equal(
			resolveEditorLink('cloudcannon:collections/[collection]:/edit?path=x', context()),
			undefined
		);
		assert.equal(
			resolveEditorLink('cloudcannon:collections/posts/{{ post.path }}', context()),
			undefined
		);
	});

	it('flags legacy never-dead route prefixes as deprecated (info)', () => {
		for (const prefix of ['explore', 'browser', 'update', 'source']) {
			const finding = resolveEditorLink(`cloudcannon:${prefix}/whatever/missing.md`, context());
			assert.equal(finding?.level, 'info', `${prefix}/ should be an info notice`);
			assert.match(finding?.message ?? '', /legacy editor-route prefix/);
		}
	});

	it('resolves content/ and data/ as real file paths (dead-link on a miss)', () => {
		assert.equal(
			resolveEditorLink('cloudcannon:content/src/content/pages/index.md', context()),
			undefined
		);
		assert.equal(resolveEditorLink('cloudcannon:data/data/pricing.json', context()), undefined);
		assert.equal(resolveEditorLink('cloudcannon:content/nope.md', context())?.level, 'error');
	});

	it('errors on visual/ and preview/ prefixes, which the app cannot open', () => {
		assert.equal(resolveEditorLink('cloudcannon:visual/src/index.html', context())?.level, 'error');
		assert.equal(resolveEditorLink('cloudcannon:preview/src/x.md', context())?.level, 'error');
	});
});

describe('resolveEditorLink — unverifiable and source-relative forms', () => {
	it('skips front-matter references', () => {
		assert.equal(resolveEditorLink('cloudcannon:#title', context()), undefined);
		assert.equal(resolveEditorLink('cloudcannon:#object.array[0]', context()), undefined);
	});

	it('skips app-root (!) and known app routes', () => {
		assert.equal(resolveEditorLink('cloudcannon:!support', context()), undefined);
		assert.equal(resolveEditorLink('cloudcannon:status', context()), undefined);
	});

	it('skips links containing unresolved placeholders', () => {
		assert.equal(
			resolveEditorLink('cloudcannon:collections/posts/{{ post.path }}', context()),
			undefined
		);
	});

	it('treats the injected fileExists probe as authoritative for path resolution', () => {
		const present = context({ fileExists: () => true });
		assert.equal(resolveEditorLink('cloudcannon:collections/anything/here.md', present), undefined);

		const absent = context({ fileExists: () => false });
		const finding = resolveEditorLink('cloudcannon:collections/anything/here.md', absent);
		assert.equal(finding?.level, 'error');
	});
});

describe('resolveEditorLink — collection key resolution', () => {
	const nested = (): LinkContext => ({
		collections: new Map([['blog/posts', { key: 'blog/posts', path: 'blog/_posts', schemas: [] }]]),
		source: '',
		fileExists: () => false,
	});

	it('browses a collection only when it has a path', () => {
		const pathless: LinkContext = {
			collections: new Map([['staff', { key: 'staff', schemas: [] }]]),
			source: '',
			fileExists: () => false,
		};
		assert.equal(resolveEditorLink('cloudcannon:collections/staff', pathless)?.level, 'error');
	});

	it('browses a nested key via its –-encoded form', () => {
		assert.equal(resolveEditorLink('cloudcannon:collections/blog–posts', nested()), undefined);
	});

	it('rejects the un-encoded nested form collections/blog/posts', () => {
		const finding = resolveEditorLink('cloudcannon:collections/blog/posts', nested());
		assert.equal(finding?.level, 'error');
	});
});
