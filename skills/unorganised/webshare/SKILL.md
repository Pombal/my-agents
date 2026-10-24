---
name: webshare
description: Put generated images, videos, HTML, and markdown where Stefan can open them in his local webshare browser. Use whenever you produce something visual for Stefan to look at, or Stefan mentions webshare or :8080.
---

`~/www/webshare/` is served on a private LAN + Tailscale origin configured in `~/.config/my-agents/local.md`. Read that origin before constructing links. For public links, use the `share-on-my-droplet` skill.

1. Save images to `~/www/webshare/images/`, videos to `~/www/webshare/videos/`, and HTML or markdown to `~/www/webshare/pages/`.
2. Use an absolute path. Tools such as `agy` send relative paths to a scratch directory.
3. Verify the direct URL loads, then print the URL mirroring the path under `~/www/webshare/` (e.g. `~/www/webshare/reports/audits/x.md` → `<webshare-origin>/reports/audits/x.md`). Give the file path only on request.

WebM files are served as `video/webm`; link them directly for the browser's native player.

## Sharing a whole folder by symlink

When the user asks to share or symlink a whole folder, put the symlink directly at `~/www/webshare/<share-name>`, pointing to the folder's absolute path. No copying or server restart is needed.

```sh
ln -s /absolute/path/to/folder "$HOME/www/webshare/share-name"
```

Choose an unused share name; do not overwrite an existing file, directory, or symlink. Verify `<webshare-origin>/<share-name>/` and a file beneath it load, then return the browser URL.

Live-verified 2026-09-10: Webshare follows absolute and relative file symlinks, symlink chains, and directory symlinks, including targets outside `~/www/webshare/`. Linked directories are browsable. Broken or looping symlinks are omitted from listings and return 404.

Only link folders intended to be shared: their readable contents, including nested symlink targets, become accessible to anyone who can reach Webshare. Removing the share symlink unpublishes that path without deleting the source folder.

If a page does not load, restart the server: `systemctl --user restart webshare-local`.
