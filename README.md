# create-cf-static-site

Creates a static site project that deploys to a Cloudflare Worker (Workers
Static Assets, free tier) on your own domain, with GitHub Actions CI/CD: a
preview URL on every PR and a production deploy on every push to `main`.

```sh
npx create-cf-static-site my-site
# or: npm create cf-static-site my-site
```

| Option | Does |
| --- | --- |
| `<dir>` | New or empty folder for the project (`.` works in an empty folder) |
| `--name <name>` | Worker name. Default: the folder name, made lowercase with dashes |

It copies the project, sets the Worker name, and runs `npm install` to get the
pinned `cf` CLI. Then:

1. Set `DOMAINS` in `cloudflare.config.ts`. It starts empty, and
   `make test` / `make build` fail until you set it.
2. Do the one-time setup in the new project's `docs/HUMAN_SETUP.md`
   (Cloudflare account, domain, API token).
3. `make deploy`.

The generated project's own `README.md` covers the rest: swapping in a site
generator (Astro, Hugo, Vite, ...), commands, costs and limits.

Needs Node 24+, plus `make`, `git` and `rsync` (preinstalled on macOS and Linux).

## Working on this package

`template/` is the project that gets copied. `bin/create.mjs` is the CLI.

| Command | Does |
| --- | --- |
| `make smoke` | Scaffold a throwaway project, then run its `make test build` |
| `make pack-check` | List the files `npm publish` would upload |
| `make install` | Install `cf` into `template/` to run its targets in place |

Inside `template/`, `make test` and `make build` need a domain in `DOMAINS`, so
`make smoke` is the easy way to check a template change.

## License

[MIT](LICENSE). Use it for anything, closed source included, as long as the
license notice stays. Every new project gets a copy of `LICENSE`.

## Publishing

A human step: `npm login`, bump `version` in `package.json`, run
`make smoke pack-check`, then `npm publish`.
