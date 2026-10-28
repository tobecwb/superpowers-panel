# superpowers-panel

A Claude Code mod that shows the
[superpowers-extended-cc](https://github.com/pcvelz/superpowers) workflow in an animated side panel:

- a card with the current phase (the active superpowers skill), the plan being executed and its progress;
- **Now** (tasks in progress and the ones waiting on you), **Up next** and done;
- session tasks outside the plan;
- specs without a plan, incomplete plans, plans without a spec and completed plans — click a plan
  to see its details.

The panel speaks English and Brazilian Portuguese.

## Install

In a Claude Code session (2.1.275 or later):

    /plugin install superpowers-panel --marketplace tobecwb/superpowers-panel

Or in two steps:

    /plugin marketplace add tobecwb/superpowers-panel
    /plugin install superpowers-panel@superpowers-panel

To get new releases, run `/plugin marketplace update superpowers-panel`, or turn on auto-update
under `/plugin` > Marketplaces.

To run from a local checkout instead:

    git clone https://github.com/tobecwb/superpowers-panel.git
    claude --plugin-dir /path/to/superpowers-panel

## Usage

The panel opens on its own in projects that have a `docs/superpowers/` folder.

- `/sp` — toggle the panel
- `/sp status` — text summary
- `/sp sync` — re-read the project and the session tasks
- `/sp lang [pt-BR|en|auto]` — show or set the language

The language (pt-BR or en) follows Claude Code's `language` setting; without it, the `LANG`
environment variable; without either, English. `/sp lang` pins a choice and `/sp lang auto` goes
back to detection.

## Development

    bun install        # installs the tools and enables the pre-commit hook
    bun run check      # typecheck + lint + dead code + comment language + tests
    bun run fix        # applies Biome formatting and safe fixes

Code conventions are in [`CLAUDE.md`](CLAUDE.md). `main` only takes pull requests; CI runs
`bun run check` on every one.

### Releasing

Bump `version` in `.claude-plugin/plugin.json` in a pull request. The `release` workflow fails the
PR if the version is below the latest release, and on merge it creates the
`superpowers-panel--v<version>` tag and a GitHub Release. A PR that keeps the version releases
nothing. `bun run release:check` shows what a merge would do.

## License

[MIT](LICENSE)
