# Marquee - Cinematic Movie Player

A local-first, cinematic companion for your movie collection. Marquee scans your hard drive for film files, builds a beautiful library with generated poster art, and plays your movies with a full-featured, theater-style player. Everything runs locally - no accounts, no movie databases, no internet required.

## Features

### Library
- **Automatic scanning** - on first launch Marquee scans your Downloads folder; add more folders any time with **Add folder…**. Recognized formats: `mp4`, `mkv`, `avi`, `mov`, `m4v`, `wmv`, `webm`, `mpg`, `mpeg`.
- **Smart titles** - film names, release year, resolution and audio language are parsed automatically from file names (e.g. `Spider Man Into The Spider Verse (2018) 1080p [CZ Dabing].mkv` becomes *Spider Man Into The Spider Verse* with `2018`, `1080P` and `CZ` badges).
- **Poster art** - every film gets a unique gradient poster with a monogram derived from its title; matching artwork files (`.jpg`/`.png`/`.webp`) next to a movie are picked up automatically.
- **Search** - filter your library instantly by title, year or language (`/` focuses the search box).
- **Status badges** - resolution, format and audio-language tags on every tile, plus a green dot for films you've finished.

### The player
- **Cinematic experience** - letterboxed dark UI, film-grain overlay, auto-hiding controls. In fullscreen, the cursor disappears along with the UI until you move the mouse.
- **Custom controls** - click/drag the timeline to seek, skip ±10s, playback speed (0.5×–2×), volume, mute, fullscreen.
- **Resume playback** - a "Continue from m:ss?" prompt appears where you left off; progress is saved as you watch.
- **Continue watching row** - films in progress surface on the Home page, sorted by recency.
- **Watched tracking** - mark films as watched manually or let playback tag them automatically when they end.
- **VLC fallback** - if the built-in engine can't decode a file, open it in VLC with one click. Handy for exotic codecs or extra subtitle control.

### Organizing
- **Favorites** - ♥ any film from its `⋮` menu, then browse them from the sidebar.
- **Collections** - group films your way. Each collection has a **pretty name** (what you see) and an internal slug (what the app uses under the hood), so you can rename freely without breaking anything.
  - Create, rename (✎) and delete (✕) collections; add films via the tile's `⋮` menu, the card hover overlay, or the detail view.
- **Detail view** - click any poster for a full-screen spotlight with tags, metadata, playback controls and per-collection management.

### The `⋮` menu
Hover a movie tile and the `⋮` appears in the corner. It opens a vertical menu with labeled actions: **Add to favorites**, **Add to collection**, **Mark as watched / unplayed**, and **Open with VLC**. The menu stays open as you move into it and only dismisses when your cursor moves above its position (or via `Esc`).

### Keyboard shortcuts
| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `←` / `→` | Back / forward 10 seconds |
| `↑` / `↓` | Volume up / down |
| `M` | Mute |
| `F` | Toggle fullscreen |
| `S` | Cycle playback speed |
| `/` | Focus search |
| `Esc` | Back / exit fullscreen / close menus |

### Data & privacy
All your data - folders, favorites, collections, watch progress - lives in a single JSON file at `%APPDATA%\Marquee\marquee-store.json`. Nothing is uploaded anywhere.

## Requirements

- **Windows 10/11** (x64)
- ~250 MB disk space for the app
- **[VLC Media Player](https://www.videolan.org/vlc/)** (optional but recommended) to play anything the built-in engine can't handle, e.g. exotic audio codecs or subtitles

## Installation

### Option 1 - Installer (recommended)
Run `[Setup.exe](https://github.com/ondrejplaysgd2/marquee/releases/download/v1.0.0/Setup.exe)` and just wait for it to install. Marquee will then be available from the Start Menu.

### Option 2 - Portable
Run `Marquee.exe` from your `Unpacked.zip` that's been extracted, directly - no installation needed.

### Option 3 - From source
```bash
npm install
npm start
```

## Building from source

```bash
npm install        # install dependencies (Electron + electron-builder)
npm run build      # package the app
```

The build outputs to `dist/`:

| Artifact | Purpose |
| --- | --- |
| `dist/Marquee Setup 1.0.0.exe` | NSIS installer |
| `dist/win-unpacked/Marquee.exe` | Unpacked app - run directly |
| `dist/Marquee Setup 1.0.0.exe.blockmap` | Update-delta metadata for the installer |

Notes:
- Release builds are unsigned; Windows SmartScreen may show a warning on first run - *More info → Run anyway*.
- If your npm version blocks package install scripts, run the Electron binary download manually: `node node_modules/electron/install.js` before `npm start`.
- The installer is one-click, go install.

## Development

Run the automated smoke suite (UI, menus, collections, seeking and playback checks) with:

```bash
set MARQUEE_SMOKE=1
npm start
```

You'll see `SMOKE …` lines in the console; the app exits when done.

## Project layout

```
main.js               Electron main process - window, scanning, IPC, VLC launch
preload.js            Bridge between the renderer and Electron
renderer/index.html   App UI structure
renderer/styles.css   The cinematic theme
renderer/app.js       Library, collections, player and menus
```

## License
See (LICENSE file)[https://github.com/ondrejplaysgd2/marquee?tab=MIT-1-ov-file] for the license.
Licensed MIT.
