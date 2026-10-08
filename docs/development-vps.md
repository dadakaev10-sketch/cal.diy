# Fixmit VPS development

The authoritative workspace is `/opt/workspaces/fixmit` on VPS `187.127.79.228`.
All installation, tests, typechecks, previews and builds execute there.

```sh
/opt/workspaces/fixmit-tools/run install --immutable
/opt/workspaces/fixmit-tools/run type-check:ci --force
/opt/workspaces/fixmit-tools/run biome check scripts/docker-dependency-inputs.cjs
/opt/workspaces/fixmit-tools/run vitest run <relevant-test-path>
```

The runner uses Node 20, 2 CPUs and 8 GiB RAM, with caches under
`/opt/workspaces/fixmit-cache`. It publishes no ports and supplies dummy database
URLs. Database integration tests need a separate disposable test database.
Production credentials must not be copied into the development checkout.

Production builds and rollout use the existing Coolify application. The Dockerfile
separates package manifests and dependency installation from source compilation.
Only a package manifest, Yarn lockfile/configuration or runtime change invalidates
the dependency layer. Native dependency install scripts run normally; workspace
code generation runs after source files are present. Yarn download and Next.js
compiler caches persist through BuildKit cache mounts. Workspace generation runs explicitly on every source build because the upstream
post-install task does not declare all generated outputs for safe cache restoration. Next.js still validates and bundles changed application
code; cached builds do not guarantee every change deploys instantly.

Keep the Docker/BuildKit cache between normal deployments. A manual no-cache
build or cache pruning intentionally causes a full rebuild. Do not automatically
prune these caches after deployments.

Git pushes may use the existing MacBook checkout as a lightweight credential
bridge. The VPS clone needs no transferred personal private key.
