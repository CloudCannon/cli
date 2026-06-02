# CloudCannon CLI

Command line interface for the CloudCannon CMS.

[![npm version](https://img.shields.io/npm/v/@cloudcannon/cli)](https://www.npmjs.com/package/@cloudcannon/cli)

## Highlights

- Generates CloudCannon configuration files interactively or non-interactively.
- Detects your static site generator automatically, works with Astro, Bridgetown, Docusaurus, Eleventy, Gatsby, Hexo, Hugo, Jekyll, Lume, MkDocs, Next.js, Nuxt, Sphinx, SvelteKit.
- Suggests collections, build commands, and output paths based on your project.
- Validates CloudCannon configuration files against the schema, including split configuration files.
- Manage organisations, sites, builds, files, and form submissions via the CloudCannon API.

## Install

```sh
npm install --global @cloudcannon/cli
```

## Authentication

Commands that interact with the CloudCannon API require an API key. Set it via the `CLOUDCANNON_API_KEY` environment variable:

```sh
export CLOUDCANNON_API_KEY=your_api_key
```

## Usage

```
cloudcannon <command> [args] [flags]
```

Run without arguments to see available commands:

```sh
cloudcannon --help
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
| `--initial-site-settings` | Also generate `.cloudcannon/initial-site-settings.json` | `false` |
| `--initial-site-settings-only` | Only generate `.cloudcannon/initial-site-settings.json` | `false` |
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

### `configure validate [path]`

Validate CloudCannon configuration files against the schema.

```sh
cloudcannon configure validate
cloudcannon configure validate ./my-site
```

By default validates all configuration files found: `cloudcannon.config.yml`, `.cloudcannon/initial-site-settings.json`, `.cloudcannon/routing.json`, and any split configuration files.

Use `--stdin` to read from stdin. Exactly one of `--configuration`, `--initial-site-settings`, or `--routing` must also be set to indicate the type of file being piped:

```sh
cat cloudcannon.config.yml | cloudcannon configure validate --stdin --configuration
```

> **Note:** When reading from stdin, split configuration files referenced via `*_from_glob` keys are not validated. Run `cloudcannon configure validate` on a directory to validate split configuration files.

**Flags**

| Flag | Description |
|---|---|
| `--configuration` | Validate only the CloudCannon configuration file and any split configuration files |
| `--initial-site-settings` | Validate only `.cloudcannon/initial-site-settings.json` |
| `--routing` | Validate only `.cloudcannon/routing.json` |
| `--configuration-path <path>` | Path to the CloudCannon configuration file, overrides `path` search |
| `--stdin` | Read from stdin instead of files on disk |

---

### `orgs list`

List all organisations.

```sh
cloudcannon orgs list
```

**Flags**

| Flag | Description |
|---|---|
| `--page <n>` | Page number to fetch |
| `--items <n>` | Number of items per page |
| `--sort-by <field>` | Field name to sort by |
| `--sort-direction <ASC\|DESC>` | Sort direction |
| `--filter <key=value,key=value>` | Comma-separated key=value pairs to filter by |

---

### `orgs get --org <name|id|uuid>`

Get an organisation by name, ID, or UUID.

```sh
cloudcannon orgs get --org my-org
```

**Flags**

| Flag | Description |
|---|---|
| `--org <name\|id\|uuid>` | The organisation name, ID, or UUID (required) |

---

### `orgs sites list --org <name|id|uuid>`

List all sites for an organisation.

```sh
cloudcannon orgs sites list --org my-org
```

**Flags**

| Flag | Description |
|---|---|
| `--org <name\|id\|uuid>` | The organisation name, ID, or UUID (required) |
| `--page <n>` | Page number to fetch |
| `--items <n>` | Number of items per page |
| `--sort-by <field>` | Field name to sort by |
| `--sort-direction <ASC\|DESC>` | Sort direction |
| `--filter <key=value,key=value>` | Comma-separated key=value pairs to filter by |

---

### `orgs inboxes list --org <name|id|uuid>`

List all inboxes for an organisation.

```sh
cloudcannon orgs inboxes list --org my-org
```

**Flags**

| Flag | Description |
|---|---|
| `--org <name\|id\|uuid>` | The organisation name, ID, or UUID (required) |
| `--page <n>` | Page number to fetch |
| `--items <n>` | Number of items per page |
| `--sort-by <field>` | Field name to sort by |
| `--sort-direction <ASC\|DESC>` | Sort direction |
| `--filter <key=value,key=value>` | Comma-separated key=value pairs to filter by |

---

### `sites list`

List all sites across all organisations.

```sh
cloudcannon sites list
```

---

### `sites get --site <name|id|uuid|domain>`

Get a site by name, ID, UUID, or domain.

```sh
cloudcannon sites get --site my-site
```

**Flags**

| Flag | Description |
|---|---|
| `--site <name\|id\|uuid\|domain>` | The site name, ID, UUID, or domain (required) |

---

### `sites rebuild --site <name|id|uuid|domain>`

Trigger a rebuild for a site.

```sh
cloudcannon sites rebuild --site my-site
```

**Flags**

| Flag | Description |
|---|---|
| `--site <name\|id\|uuid\|domain>` | The site name, ID, UUID, or domain (required) |

---

### `sites update-build-config --site <name|id|uuid|domain>`

Update the build configuration for a site.

```sh
cloudcannon sites update-build-config --site my-site --ssg hugo
```

**Flags**

| Flag | Description |
|---|---|
| `--site <name\|id\|uuid\|domain>` | The site name, ID, UUID, or domain (required) |
| `--ssg <name>` | Static site generator name |
| `--building-locked <true\|false>` | Lock the site from building |
| `--uses-i18n <true\|false>` | Enable i18n support |
| `--default-locale <locale>` | Default locale for i18n |
| `--install-command <cmd>` | Override install command |
| `--build-command <cmd>` | Override build command |
| `--output-path <path>` | Override output path |
| `--preserved-paths <paths>` | Comma-separated preserved paths |
| `--hugo-version <version>` | Hugo version |
| `--node-version <version>` | Node version |
| `--ruby-version <version>` | Ruby version |
| `--deno-version <version>` | Deno version |
| `--preserve-output <true\|false>` | Preserve previous output |
| `--include-git <true\|false>` | Include git history in build |

---

### `sites files list --site <name|id|uuid|domain>`

List files from a site.

```sh
cloudcannon sites files list --site my-site
```

**Flags**

| Flag | Description |
|---|---|
| `--site <name\|id\|uuid\|domain>` | The site name, ID, UUID, or domain (required) |

---

### `sites files get --site <name|id|uuid|domain> [path]`

Get the contents of a file from a site.

```sh
cloudcannon sites files get --site my-site index.html
cloudcannon sites files get --site my-site index.html --output ./local-index.html
```

**Flags**

| Flag | Description |
|---|---|
| `--site <name\|id\|uuid\|domain>` | The site name, ID, UUID, or domain (required) |
| `--output <path>` | Path to save the file to. If not provided then the file is printed to STDOUT |

---

### `sites files upload --site <name|id|uuid|domain> [localPath] [path]`

Upload a file to a site.

```sh
cloudcannon sites files upload --site my-site ./local-file.html /uploaded-file.html
```

**Flags**

| Flag | Description | Default |
|---|---|---|
| `--site <name\|id\|uuid\|domain>` | The site name, ID, UUID, or domain (required) |
| `--type <mime>` | MIME type of the file | |
| `--overwrite` | Overwrite if the file already exists | `false` |

---

### `sites builds list --site <name|id|uuid|domain>`

List builds for a site.

```sh
cloudcannon sites builds list --site my-site
```

**Flags**

| Flag | Description |
|---|---|
| `--site <name\|id\|uuid\|domain>` | The site name, ID, UUID, or domain (required) |
| `--page <n>` | Page number to fetch |
| `--items <n>` | Number of items per page |
| `--sort-by <field>` | Field name to sort by |
| `--sort-direction <ASC\|DESC>` | Sort direction |
| `--filter <key=value,key=value>` | Comma-separated key=value pairs to filter by |

---

### `sites print-last-build --site <name|id|uuid|domain>`

Print the logs for the most recent build of a site.

```sh
cloudcannon sites print-last-build --site my-site
```

**Flags**

| Flag | Description |
|---|---|
| `--site <name\|id\|uuid\|domain>` | The site name, ID, UUID, or domain (required) |

---

### `sites print-last-failed-build --site <name|id|uuid|domain>`

Print the logs for the most recent failed build of a site.

```sh
cloudcannon sites print-last-failed-build --site my-site
```

**Flags**

| Flag | Description |
|---|---|
| `--site <name\|id\|uuid\|domain>` | The site name, ID, UUID, or domain (required) |

---

### `sites print-last-sync --site <name|id|uuid|domain>`

Print the logs for the most recent sync of a site.

```sh
cloudcannon sites print-last-sync --site my-site
```

**Flags**

| Flag | Description |
|---|---|
| `--site <name\|id\|uuid\|domain>` | The site name, ID, UUID, or domain (required) |

---

### `sites print-last-failed-sync --site <name|id|uuid|domain>`

Print the logs for the most recent failed sync of a site.

```sh
cloudcannon sites print-last-failed-sync --site my-site
```

**Flags**

| Flag | Description |
|---|---|
| `--site <name\|id\|uuid\|domain>` | The site name, ID, UUID, or domain (required) |

---

### `builds print-logs --build <uuid>`

Print the logs for a build.

```sh
cloudcannon builds print-logs --build <uuid>
```

**Flags**

| Flag | Description |
|---|---|
| `--build <uuid>` | The build UUID (required) |

---

### `inboxes submissions list --inbox <name|id|key|uuid>`

List submissions for an inbox.

```sh
cloudcannon inboxes submissions list --inbox my-inbox
```

**Flags**

| Flag | Description |
|---|---|
| `--inbox <name\|id\|key\|uuid>` | The inbox name, ID, key, or UUID (required) |
| `--page <n>` | Page number to fetch |
| `--items <n>` | Number of items per page |
| `--sort-by <field>` | Field name to sort by |
| `--sort-direction <ASC\|DESC>` | Sort direction |
| `--filter <key=value,key=value>` | Comma-separated key=value pairs to filter by |

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
