# CloudCannon CLI

Command line interface for the CloudCannon CMS.

[![npm version](https://img.shields.io/npm/v/@cloudcannon/cli)](https://www.npmjs.com/package/@cloudcannon/cli)

## Highlights

- Generates CloudCannon configuration files interactively or non-interactively.
- Detects your static site generator automatically, works with Astro, Bridgetown, Docusaurus, Eleventy, Gatsby, Hexo, Hugo, Jekyll, Lume, MkDocs, Next.js, Nuxt, Sphinx, SvelteKit.
- Suggests collections, build commands, and output paths based on your project.
- Validates CloudCannon configuration files against the schema, including split configuration files.
- Runs a local dev server that loads the CloudCannon app against your local files, with live sync in both directions.
- Manage organisations, sites, builds, files, and form submissions via the CloudCannon API.

## Install

```sh
npm install --global @cloudcannon/cli
```

## Authentication

Commands that interact with the CloudCannon API require authentication. You can authenticate using:

### User Access Key (Recommended)

Log in with your CloudCannon account interactively with your web browser:

```sh
cloudcannon login
```

For non-interactive environments, you can provide your access key via command line flags:

```sh
cloudcannon login --access-key-id <id> --access-key-secret <secret>
```

Or set environment variables:

```sh
export CC_ACCESS_KEY_ID=your_key_id
export CC_ACCESS_KEY_SECRET=your_key_secret
```

### API Key

Alternatively, set the `CLOUDCANNON_API_KEY` environment variable:

```sh
export CLOUDCANNON_API_KEY=your_api_key
```

### Logout

To log out and remove stored credentials:

```sh
cloudcannon logout
```

## Shell completions

Enable tab completion for your shell by adding the following to your shell config:

```sh
# zsh
echo 'source <(cloudcannon complete zsh)' >> ~/.zshrc

# bash
echo 'source <(cloudcannon complete bash)' >> ~/.bashrc

# fish
echo 'cloudcannon complete fish | source' >> ~/.config/fish/config.fish
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

### `login`

Log in to your CloudCannon account using a user access key.

```sh
cloudcannon login
cloudcannon login --access-key-id <id> --access-key-secret <secret>
```

**Flags**

| Flag | Description |
|---|---|
| `--access-key-id <string>` | Access key ID for non-interactive login |
| `--access-key-secret <string>` | Access key secret for non-interactive login |

---

### `logout`

Log out and remove stored credentials.

```sh
cloudcannon logout
```

---

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

### `validate [path]`

Validate CloudCannon configuration files against the schema.

```sh
cloudcannon validate
cloudcannon validate ./my-site
```

By default validates all configuration files found: `cloudcannon.config.yml`, `.cloudcannon/initial-site-settings.json`, `.cloudcannon/routing.json`, and any split configuration files.

Use `--stdin` to read from stdin. Exactly one of `--configuration`, `--initial-site-settings`, or `--routing` must also be set to indicate the type of file being piped:

```sh
cat cloudcannon.config.yml | cloudcannon validate --stdin --configuration
```

> **Note:** When reading from stdin, split configuration files referenced via `*_from_glob` keys are not validated. Run `cloudcannon validate` on a directory to validate split configuration files.

**Flags**

| Flag | Description |
|---|---|
| `--configuration` | Validate only the CloudCannon configuration file and any split configuration files |
| `--initial-site-settings` | Validate only `.cloudcannon/initial-site-settings.json` |
| `--routing` | Validate only `.cloudcannon/routing.json` |
| `--configuration-path <path>` | Path to the CloudCannon configuration file, overrides `path` search |
| `--stdin` | Read from stdin instead of files on disk |

---

### `dev [outputPath]`

Run a local dev server that loads the CloudCannon app in your browser, pointed at your local site files. This lets you preview and edit your site in CloudCannon without deploying.

File changes on disk are pushed to the app in real time, and edits made in the app are written back to disk.

```sh
cloudcannon dev output
cloudcannon dev ./_site --port 3000
```

**Flags**

| Flag | Description | Default |
|---|---|---|
| `--port <port>` | Port to run the dev server on | `10101` |
| `--live-sync` / `--no-live-sync` | Push disk file changes to the app | `true` |
| `--app-sync` / `--no-app-sync` | Accept app-initiated file writes (uploads, moves, deletes) to disk | `true` |
| `--verbose` | Log every request (method, path, status, duration) | `false` |

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

### `orgs get [org]`

Get an organization by name, ID, or UUID. If you belong to only one organization, it is selected automatically.

```sh
cloudcannon orgs get --org my-org
cloudcannon orgs get
```

**Flags**

| Flag | Description |
|---|---|
| `--org <name\|id\|uuid>` | The organization name, ID, or UUID |

---

### `orgs sites list [org]`

List all sites for an organization. If you belong to only one organization, it is selected automatically.

```sh
cloudcannon orgs sites list --org my-org
cloudcannon orgs sites list
```

**Flags**

| Flag | Description |
|---|---|
| `--org <name\|id\|uuid>` | The organization name, ID, or UUID |
| `--page <n>` | Page number to fetch |
| `--items <n>` | Number of items per page |
| `--sort-by <field>` | Field name to sort by |
| `--sort-direction <ASC\|DESC>` | Sort direction |
| `--filter <key=value,key=value>` | Comma-separated key=value pairs to filter by |

---

### `orgs inboxes list [org]`

List all inboxes for an organization. If you belong to only one organization, it is selected automatically.

```sh
cloudcannon orgs inboxes list --org my-org
cloudcannon orgs inboxes list
```

**Flags**

| Flag | Description |
|---|---|
| `--org <name\|id\|uuid>` | The organization name, ID, or UUID |
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

### `sites status`

Show the latest sync/build status for sites. By default, prints a JSON array of status rows. Use `--format` for human-readable or custom output.

Each site is reported as one of: `No New Build`, `Syncing`, `Building`, `Built`, or `Failed`. “Today” is the local calendar day of the machine running the CLI.

```sh
# JSON (default)
cloudcannon sites status
cloudcannon sites status --branch=production

# Presets
cloudcannon sites status --format lines
cloudcannon sites status --format table
cloudcannon sites status --format csv

# Custom template
cloudcannon sites status --format '{site_name}: {status}'
cloudcannon sites status --format '{site_name}\t{branch}\t{status}'

# Filter and watch
cloudcannon sites status --org my-org --branch=production --match='Today Cash'
cloudcannon sites status --branch=production --format lines --watch
cloudcannon sites status --watch --interval=5 --format table
```

**Flags**

| Flag | Description | Default |
|---|---|---|
| `--branch <name>` | Only include sites syncing from this git branch | |
| `--match <regex>` | Case-insensitive regex against site name, UUID, ID, domain, stable domain, or branch | |
| `--org <name\|id\|uuid>` | Limit to one Organization; omit to scan all Organizations | |
| `--format <preset\|template>` | Output format (see below). Omit for JSON | |
| `--watch` | Refresh the filtered status list until interrupted | `false` |
| `--interval <seconds>` | Watch refresh interval in seconds | `10` |

**`--format` values**

| Value | Output |
|---|---|
| *(omitted)* | JSON array of `{ site_name, uuid, id, branch, status }` |
| `lines` | `Site Name: Status` (duplicate names become `Site Name (branch): Status`) |
| `table` | Aligned columns: `SITE_NAME`, `BRANCH`, `STATUS` |
| `csv` | CSV with header row (`site_name,uuid,id,branch,status`) |
| *template* | Named placeholders: `{site_name}`, `{uuid}`, `{id}`, `{branch}`, `{status}`. Use `{{` / `}}` for literal braces. Unknown placeholders exit with an error. |

---

### `sites create [source]`

Create a new site connected to a git repository. The `source` positional is a git remote URL with an optional `#branch` suffix.

```sh
# Interactive — prompts for org, name, and source
cloudcannon sites create

# Non-interactive — all fields provided
cloudcannon sites create --org my-org --name my-site https://github.com/owner/repo.git#main
```

Run without all required fields to get interactive prompts for the missing pieces. If you belong to only one organization, it is selected automatically — use `--org` to override. The source URL defaults to your local `git remote get-url origin` if available. After creating the site, a link to open it in CloudCannon is printed.

**Flags**

| Flag | Description |
|---|---|
| `--org <name\|id\|uuid>` | The organization name, ID, or UUID |
| `--name <string>` | The site name |

Supported git hosts: `github.com`, `gitlab.com`, `bitbucket.org`.

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
| `--building-locked` / `--no-building-locked` | Lock the site from building |
| `--default-locale <locale>` | Default locale for i18n |
| `--install-command <cmd>` | Override install command |
| `--build-command <cmd>` | Override build command |
| `--output-path <path>` | Override output path |
| `--preserved-paths <paths>` | Comma-separated preserved paths |
| `--hugo-version <version>` | Hugo version |
| `--node-version <version>` | Node version |
| `--ruby-version <version>` | Ruby version |
| `--deno-version <version>` | Deno version |
| `--preserve-output` / `--no-preserve-output` | Preserve previous output |
| `--include-git` / `--no-include-git` | Include git history in build |

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
cloudcannon sites files upload --site my-site ./local-file.html /uploaded-file.html --allow-overwrite
```

**Flags**

| Flag | Description | Default |
|---|---|---|
| `--site <name\|id\|uuid\|domain>` | The site name, ID, UUID, or domain (required) |
| `--type <mime>` | MIME type of the file | |
| `--allow-overwrite` | Overwrite the destination if it already exists | `false` |

---

### `sites files move --site <name|id|uuid|domain> [src] [dest]`

Move a file within a site editing session.

```sh
cloudcannon sites files move --site my-site content/old.md content/new.md
cloudcannon sites files move --site my-site content/old.md content/new.md --allow-overwrite
```

**Flags**

| Flag | Description | Default |
|---|---|---|
| `--site <name\|id\|uuid\|domain>` | The site name, ID, UUID, or domain (required) | |
| `--allow-overwrite` | Overwrite the destination if it already exists | `false` |

---

### `sites files clone --site <name|id|uuid|domain> [src] [dest]`

Clone a file to a new path within a site editing session. The source file is left unchanged.

```sh
cloudcannon sites files clone --site my-site content/post.md content/post-copy.md
cloudcannon sites files clone --site my-site content/post.md content/post-copy.md --allow-overwrite
```

**Flags**

| Flag | Description | Default |
|---|---|---|
| `--site <name\|id\|uuid\|domain>` | The site name, ID, UUID, or domain (required) | |
| `--allow-overwrite` | Overwrite the destination if it already exists | `false` |

---

### `sites files delete --site <name|id|uuid|domain> [target]...`

Delete one or more files within a site editing session. The files are removed from the repository on commit.

```sh
cloudcannon sites files delete --site my-site content/old.md
cloudcannon sites files delete --site my-site content/a.md content/b.md --discard-unsaved
```

**Flags**

| Flag | Description | Default |
|---|---|---|
| `--site <name\|id\|uuid\|domain>` | The site name, ID, UUID, or domain (required) | |
| `--discard-unsaved` | Discard any unsaved edits to the files | `false` |

---

### `sites files restore --site <name|id|uuid|domain> [target]...`

Restore one or more deleted files within a site editing session, removing the pending delete entries.

```sh
cloudcannon sites files restore --site my-site content/old.md
cloudcannon sites files restore --site my-site content/a.md content/b.md
```

**Flags**

| Flag | Description | Default |
|---|---|---|
| `--site <name\|id\|uuid\|domain>` | The site name, ID, UUID, or domain (required) | |

---

### `sites files discard --site <name|id|uuid|domain> [target]...`

Discard one or more session files from a site editing session, permanently deleting their pending edits.

```sh
cloudcannon sites files discard --site my-site content/old.md
cloudcannon sites files discard --site my-site content/a.md content/b.md
```

**Flags**

| Flag | Description | Default |
|---|---|---|
| `--site <name\|id\|uuid\|domain>` | The site name, ID, UUID, or domain (required) | |

---

### `sites files list-edits --site <name|id|uuid|domain>`

List pending edits on the site's current editing session.

```sh
cloudcannon sites files list-edits --site my-site
cloudcannon sites files list-edits --site my-site --verbose
```

**Flags**

| Flag | Description | Default |
|---|---|---|
| `--site <name\|id\|uuid\|domain>` | The site name, ID, UUID, or domain (required) | |
| `--verbose` | Print the full objects returned by the API | `false` |

---

### `sites files commit --site <name|id|uuid|domain> [path]...`

Commit a site editing session, pushing changes to the connected repository.

```sh
cloudcannon sites files commit --site my-site --all
cloudcannon sites files commit --site my-site content/a.md content/b.md --message "Publish posts"
```

**Flags**

| Flag | Description | Default |
|---|---|---|
| `--site <name\|id\|uuid\|domain>` | The site name, ID, UUID, or domain (required) | |
| `--all` | Commit all files in the editing session | `false` |
| `--message <msg>` | Commit message | |

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
