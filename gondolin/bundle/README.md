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

## Build invariants

Keep these properties when changing the image spec:

1. **Writable throwaway rootfs:** keep `runtimeDefaults.rootfsMode` as `"cow"`.
   Gondolin init creates mount points such as `/data`; `"readonly"` can panic
   the guest during boot. `"cow"` still keeps writes out of the base image by
   using a disposable qcow2 overlay.
2. **Graphviz plugin cache:** keep `dot -c` in `postBuild.commands`. Without it,
   `dot -Tpng` can fail with `Format: "png" not recognized` because Graphviz
   plugins were not registered during image assembly.
3. **Mermaid executable path:** keep `ln -sf /usr/local/bin/mmdc /usr/bin/mmdc`.
   `npm install -g @mermaid-js/mermaid-cli` installs `mmdc` under
   `/usr/local/bin`, while pi-fence executes commands with Gondolin's default
   non-interactive PATH: `/usr/sbin:/usr/bin:/sbin:/bin`.
4. **Chromium guest init:** keep `init-extra.sh` aligned with Gondolin's Chromium
   example: create the `messagebus` user, compile GSettings schemas, start the
   D-Bus system bus, and append headless Chromium flags.
5. **Controller-owned startup:** do not rely on `VMOptions.autoStart: false` for
   safety. pi-fence controls startup by deciding whether to call the sandbox
   controller's `start()` method; the VM options should keep isolation focused
   on `vfs: null`, `env: {}`, and `sandbox.netEnabled: false`.

## Troubleshooting

1. If build commands cannot find Homebrew tools, export the PATH shown in
   [Prerequisites](#prerequisites). `e2fsprogs` is keg-only on macOS.
2. If Docker says `/work/build-in-container.sh` is missing, set `TMPDIR` to a
   path Docker/Colima can mount, for example:

   ```bash
   export TMPDIR="$HOME/.cache/pi-fence/gondolin-bundle/tmp"
   mkdir -p "$TMPDIR"
   ```

3. If the build is killed with exit `137`, stop memory-heavy containers such as
   SonarQube and retry.
4. If Docker/containerd reports `input/output error` after an out-of-space
   failure, restart Colima and re-pull Alpine:

   ```bash
   colima restart
   docker image rm -f alpine:3.23
   docker pull alpine:3.23
   ```

5. If the VM starts but `mmdc` is missing, confirm the symlink exists:

   ```bash
   pnpm exec gondolin exec --image pi-fence-bundle:0.1.0 -- which mmdc
   ```

6. If Graphviz renders fail with `Format: "png" not recognized`, rebuild after
   confirming `dot -c` remains in `postBuild.commands`.
