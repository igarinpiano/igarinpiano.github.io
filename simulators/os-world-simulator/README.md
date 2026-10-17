# OS World — Browser Desktop Lab

A static, GitHub Pages-friendly desktop experience inspired by classic and open-source operating systems. It includes two OS-inspired themes, one original environment, a browser window, a virtual file manager, an emulated terminal, and a Vim-like editor.

## Run locally

The app has no build step or external JavaScript dependencies. Open `index.html`, or serve this folder with any static server. For the most consistent `localStorage` behavior, use a local server rather than opening the file directly.

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Publish with GitHub Pages

1. Create a GitHub repository and add `index.html`, `styles.css`, `app.js`, and this README at the repository root.
2. Open **Settings → Pages**.
3. Choose **Deploy from a branch**, select your default branch and `/ (root)`, then save.
4. Open the Pages URL GitHub provides.

No server-side service, framework, package manager, or build workflow is required.

## Features

- Animated OS selector with CSS 3D/perspective effects and a boot sequence.
- Windows XP-inspired, Linux Mint/Cinnamon-inspired, and original OS World Studio desktops.
- Draggable, minimizable, maximizable app windows and an OS-themed taskbar/start menu.
- Browser window that embeds a requested site where that site's security policy permits it, plus an **Open** action that launches the URL in a regular browser tab.
- Virtual file manager with folders, text-file editing, import, download, rename, and delete.
- Virtual terminal with common navigation, file, search, and system-information commands.
- Vim-like editor with NORMAL/INSERT/COMMAND modes and core shortcuts such as `i`, `Esc`, `h/j/k/l`, `dd`, `yy`, `p`, `u`, `:w`, `:q`, `:wq`, and `:q!`.
- File persistence in browser `localStorage`.
- **Storage Manager** to export/import JSON backups or reset the app's own stored data.
- Keyboard-accessible controls and reduced-motion support.

## Terminal command examples

```text
help
pwd
ls
cd Documents
cat notes.md
vim notes.md
mkdir experiments
echo "hello world" > experiments/hello.txt
cp experiments/hello.txt Documents/
find hello /
```

The terminal operates only on the virtual file system. A few familiar commands are simulated for demonstration purposes; it cannot run arbitrary programs or execute commands against the visitor's computer.

## Important limitations

This is an interactive browser simulation, not a full recreation of Windows XP or Linux Mint. It does not boot a real kernel, provide hardware drivers, reproduce every shell utility, or implement the entire Vim feature set. Original CSS illustrations are used rather than OS logos or proprietary wallpaper assets.

The browser window uses the browser engine through an `iframe`. Many websites explicitly disallow iframe embedding; use **Open** to view those sites in the user's regular browser. Pop-up blockers may require allowing the new tab.

Virtual files are saved on the current site origin using `localStorage`. They do not sync between browsers/devices and may be removed by clearing site data. Use **Storage Manager → Export backup** for a portable JSON backup. The clear controls only target OS World's own storage keys, not unrelated websites' local storage.

## License

MIT for the original code in this repository. Names of operating systems are used descriptively; this project is unaffiliated with Microsoft or the Linux Mint project.
