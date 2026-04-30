# pi-fence Gondolin bundle image

This directory defines the Gondolin guest image used by `bundle-sandbox` when
`sandboxes.bundle.runtime` is `"gondolin-vm"`.

The image contract matches `docker/bundle/`:

1. `/opt/pi-fence-bundle/manifest.json`
2. `/opt/pi-fence-bundle/puppeteer-config.json`
3. `dot -Tpng` for Graphviz
4. `mmdc` for Mermaid PNG rendering

## Prerequisites

macOS:

```bash
brew install qemu zig@0.15 e2fsprogs lz4
export PATH="/opt/homebrew/opt/zig@0.15/bin:/opt/homebrew/opt/e2fsprogs/bin:/opt/homebrew/opt/e2fsprogs/sbin:$PATH"
```

Docker/Colima must be running because Gondolin uses a Linux build container on
macOS when `postBuild.commands` are present.

## Build

```bash
pnpm exec gondolin build \
  --config gondolin/bundle/pi-fence-bundle.json \
  --output .gondolin/pi-fence-bundle \
  --tag pi-fence-bundle:0.1.0
```

The build imports the assets into Gondolin's local image store and tags them as
`pi-fence-bundle:0.1.0`. It also leaves an explicit asset directory at
`.gondolin/pi-fence-bundle`.

## Verify

```bash
pnpm exec gondolin build --verify .gondolin/pi-fence-bundle
PI_FENCE_GONDOLIN_BUNDLE_IMAGE=pi-fence-bundle:0.1.0 \
  pnpm vitest run tests/integration/bundle-sandbox.live.test.ts --reporter verbose
```

If disk space is tight, use the explicit asset path instead of keeping multiple
copies in the image store:

```bash
PI_FENCE_GONDOLIN_BUNDLE_IMAGE=.gondolin/pi-fence-bundle pnpm test:live
```
