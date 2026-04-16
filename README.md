# CloudCannon CLI

Command line interface for the CloudCannon CMS.

[![npm version](https://img.shields.io/npm/v/@cloudcannon/cli)](https://www.npmjs.com/package/@cloudcannon/cli)

## Highlights

- Generates CloudCannon configuration files interactively or non-interactively.
- Detects your static site generator automatically, works with Astro, Bridgetown, Docusaurus, Eleventy, Gatsby, Hexo, Hugo, Jekyll, Lume, MkDocs, Next.js, Nuxt, Sphinx, SvelteKit.
- Suggests collections, build commands, and output paths based on your project.

## Install

```sh
npm install --global @cloudcannon/cli
```

## Usage

```
cloudcannon configure <command> [path] [flags]
```

Run without arguments to see available commands:

```sh
cloudcannon configure --help
```

## Commands

### `configure generate [path]`

Generate a `cloudcannon.config.yml` file for your site. Runs interactively by default.

```sh
cloudcannon configure generate
cloudcannon configure generate ./my-site
```

**Flags**

| Flag | Description | Default |
|---|---|---|
| `--auto` | Non-interactive, accept all suggestions | `false` |
| `--dry-run` | Print output without writing files | `false` |
| `--format <yaml\|json>` | Output format | `yaml` |
| `--output <path>` | Custom output file path | |
| `--ssg <name>` | Override SSG detection | |
| `--source <path>` | Override source folder | |
| `--mode <hosted\|headless>` | Mode for initial site settings | `hosted` |
| `--initial-build-settings` | Also generate `.cloudcannon/initial-site-settings.json` | `false` |
| `--initial-build-settings-only` | Only generate `.cloudcannon/initial-site-settings.json` | `false` |
| `--install-command <cmd>` | Override detected install command | |
| `--build-command <cmd>` | Override detected build command | |
| `--output-path <path>` | Override detected output path | |

---

### `configure detect-ssg [path]`

Detect the static site generator used by your site.

```sh
cloudcannon configure detect-ssg
cloudcannon configure detect-ssg ./my-site
```

Outputs JSON with the detected SSG and confidence scores for all supported generators.

---

### `configure detect-source [path]`

Detect the source folder for your site.

```sh
cloudcannon configure detect-source
cloudcannon configure detect-source ./my-site --ssg jekyll
```

**Flags**

| Flag | Description |
|---|---|
| `--ssg <name>` | Override SSG detection |

---

### `configure detect-collections [path]`

List the collections detected in your site.

```sh
cloudcannon configure detect-collections
cloudcannon configure detect-collections ./my-site --ssg astro
```

**Flags**

| Flag | Description |
|---|---|
| `--ssg <name>` | Override SSG detection |
| `--source <path>` | Override source folder |

---

### `configure detect-build-commands [path]`

Show suggested build commands for your site.

```sh
cloudcannon configure detect-build-commands
cloudcannon configure detect-build-commands ./my-site --ssg hugo
```

**Flags**

| Flag | Description |
|---|---|
| `--ssg <name>` | Override SSG detection |
| `--source <path>` | Override source folder |

---

## Development

Running toolproof tests:

```sh
npm run test:toolproof
npm run test:toolproof -- -i
```

## Related

- [CloudCannon](https://cloudcannon.com) — The CMS this tool configures.
- [cloudcannon.config reference](https://cloudcannon.com/documentation/articles/cloudcannon-configuration-reference/) — Full configuration reference.
- [@cloudcannon/gadget](https://github.com/CloudCannon/gadget) — The detection library powering this CLI.

## License

ISC © [CloudCannon](https://cloudcannon.com)
