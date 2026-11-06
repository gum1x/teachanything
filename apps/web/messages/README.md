# Dashboard translations

`en.json` is the source of truth. `fr.json`, `es.json` and `de.json` were
reviewed by a fluent speaker; do not regenerate them wholesale.

New and changed English text is translated with [lingo.dev](https://lingo.dev)
(config in `/.lingo/config.json`, API key in `LINGO_API_KEY`).

## One-time setup

1. `npx @lingo.dev/cli@1.17.1 login`
2. `npx @lingo.dev/cli@1.17.1 link` (picks the org and engine; commit the
   updated `.lingo/config.json`)
3. Create the baseline lockfile without retranslating anything:
   `npx @lingo.dev/cli@1.17.1 push --backfill-missing --estimate` must report
   no work, because every target file already exists. Then run it again
   without `--estimate`, with `--wait`, and commit `.lingo/lock.json`.

## After editing `en.json`

1. `npm run i18n:estimate` — shows the cost without translating.
2. `npm run i18n:translate` — translates only new or changed keys and keeps
   every other translation.
3. Have a fluent speaker review the diff in the pull request before release.

Never use `--force`: it overwrites the reviewed translations. lingo.dev does
not document ICU support for JSON, so check that `{count, plural, …}` messages
come back intact before merging.
