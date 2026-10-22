# Install NoteBuilder on macOS

Two paths. Install a prebuilt disk image, or build the disk image yourself from source.

## What you need

An Apple silicon Mac (M1 or later) running macOS 11 Big Sur or newer.

## Architecture: arm64 only

NoteBuilder ships a single arm64 slice. It does not ship a universal binary, and there is no
Intel build.

The reason is honest rather than technical: the only machine NoteBuilder is developed and tested
on is Apple silicon. A universal build would roughly double the download for every user and would
ship an Intel slice that nobody has ever launched. Shipping one architecture that is actually
exercised beats shipping two where one is a guess. This gets revisited the moment there is an
Intel machine to test on.

Practical consequence: the disk image is named `notebuilder_<version>_aarch64.dmg`, and on an
Intel Mac it will not run.

## Install from a release DMG

1. Download `notebuilder_<version>_aarch64.dmg` from the Releases page of the repository.
2. Open it. The installer window shows the NoteBuilder icon on the left, an arrow, and an
   Applications shortcut on the right.
3. Drag the NoteBuilder icon onto the Applications shortcut.
4. Eject the disk image.

### First launch takes an extra step

NoteBuilder is not signed with an Apple Developer ID and is not notarized, so macOS Gatekeeper
blocks the first launch of a copy that arrived from the internet. This is expected, and it is a
one time step per install.

On macOS 15 Sequoia and newer:

1. Double click NoteBuilder in Applications. macOS refuses and offers only Done or Move to Trash.
   Click Done.
2. Open System Settings, go to Privacy and Security, scroll to the Security section. A line names
   NoteBuilder as blocked. Click Open Anyway and confirm.
3. Launch normally from then on.

On macOS 14 Sonoma and older:

1. Right click (or Control click) NoteBuilder in Applications and choose Open.
2. Click Open in the dialog that appears.
3. Launch normally from then on.

If macOS instead reports that the app "is damaged and can't be opened", that is the quarantine
attribute on an ad hoc signed bundle, not a corrupted download. Clear it:

```bash
xattr -dr com.apple.quarantine /Applications/notebuilder.app
```

Then open the app normally. Signing and notarization would remove this friction entirely; it is
known future work and needs an Apple Developer Program membership.

## Build the DMG yourself

Nothing about the release build is special. The same command that produces the app bundle
produces the styled disk image.

### Prerequisites

- macOS on Apple silicon
- Xcode Command Line Tools: `xcode-select --install`
- The Rust toolchain, from [rustup](https://rustup.rs)
- [Node 20 or later](https://nodejs.org)

### Build

```bash
git clone https://github.com/YuZh98/notebuilder.git
cd notebuilder/v2
npm install
npm run tauri build
```

The first build compiles the whole Rust dependency tree and takes several minutes. Later builds
are incremental and take well under a minute.

Two artifacts land under `v2/src-tauri/target/release/bundle/`:

- `macos/notebuilder.app`, ad hoc signed
- `dmg/notebuilder_<version>_aarch64.dmg`, for example `notebuilder_0.3.0_aarch64.dmg`

The version in the file name follows `version` in `v2/src-tauri/tauri.conf.json`.

### If the build stops at `bundle_dmg.sh`

The app bundle is already built; what failed is the step where an AppleScript has Finder lay out
the installer window. Tauri hides the script's own error, so rerun with
`npm run tauri build -- --verbose` to see it.

The usual one is `Not authorized to send Apple events to Finder. (-1743)`: the app you build from
(Terminal, iTerm, VS Code, ...) may not control Finder. Allow it under System Settings → Privacy &
Security → Automation → Finder. If that app is not listed, reset its permission and trigger the
prompt, then click Allow:

```bash
tccutil reset AppleEvents com.apple.Terminal   # or your terminal's bundle id
osascript -e 'tell application "Finder" to get name of startup disk'
```

Delete what the failed run left behind, then build again:

```bash
rm -f src-tauri/target/release/bundle/dmg/*.dmg src-tauri/target/release/bundle/macos/rw.*.dmg
```

A Finder window opens and closes during a successful build; that is the layout step.

### Where the installer window styling comes from

The disk image layout is declared in `bundle.macOS.dmg` in `v2/src-tauri/tauri.conf.json`: a
660 by 400 window, the app icon at (180, 170), the Applications shortcut at (480, 170), and
`v2/src-tauri/dmg/background.png` as the window background. Tauri hands these to its bundled
`create-dmg` pipeline, so no separate shell script is involved.

The background image is generated, not hand drawn. Regenerate it after changing any of those
coordinates:

```bash
cd v2
node scripts/make-dmg-background.mjs
```

The script writes `v2/src-tauri/dmg/background.png` and uses nothing beyond Node's standard
library, so it is deterministic and reproducible on any machine. Commit the regenerated PNG
alongside the script change.

### Check a build

```bash
hdiutil attach v2/src-tauri/target/release/bundle/dmg/notebuilder_0.3.0_aarch64.dmg
open /Volumes/notebuilder
```

The Finder window that opens is the installer window: background image, app icon on the left,
Applications shortcut on the right. Drag the icon across to confirm the install path works, then:

```bash
hdiutil detach /Volumes/notebuilder
```
