# Tampermonkey

Tampermonkey scripts. On another computer, install [Tampermonkey](https://www.tampermonkey.net/), then open an install link below. Tampermonkey asks to install. After that it checks the same URL for updates.

Those links work only once this folder is on GitHub `main`. The file view on github.com shows source and does not install.

Bump `@version` when you change a script. Tampermonkey skips an update when the version is unchanged.

## Install

- [Discord Thread → Markdown](https://raw.githubusercontent.com/choephix/my-agents/main/tampermonkey/discord-thread-markdown.user.js) — copy a channel or thread as markdown, with permalinks and attachment URLs. Alt+Shift+C copies the visible view, or the current text selection. Alt+Shift+X, then click a message, copies from there down (max 100).
- [Gmail Attachment Harvester](https://raw.githubusercontent.com/choephix/my-agents/main/tampermonkey/gmail-attachment-harvester.user.js) — download every attachment in the current Gmail results, renamed `Sender - filename`, into a folder you pick. Chromium only (Chrome, Edge, Brave): it uses the browser's folder picker. Firefox cannot.
- [X Tweet Shot](https://raw.githubusercontent.com/choephix/my-agents/main/tampermonkey/x-tweet-shot.user.js) — click a tweet, get one PNG of it and its own replies, permalinks stamped in the footer, on the clipboard. Alt+Shift+S, or the corner triangle. First install also pulls html2canvas from cdnjs; allow that `@require` when Tampermonkey asks.

## Update

Tampermonkey checks on its own (Settings → Updates). Or open the script in the dashboard and check for updates. Edits belong in this folder, then push `main`.
