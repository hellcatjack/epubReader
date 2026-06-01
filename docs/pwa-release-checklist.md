# PWA Release Verification Checklist

Use this checklist before publishing an EPUB Reader PWA release.

## Install Metadata

- Build the app with `npm run build`.
- Confirm the generated web app manifest advertises `EPUB Reader` as the app name and short name.
- Confirm the manifest keeps `start_url` at `/` and `display` at `standalone`.
- Confirm `theme_color` and `background_color` match the intended reader shell colors.
- Install the built app from a supported desktop or mobile browser and confirm it launches without browser chrome.

## Offline Shell

- Serve the production build with `npm run preview`.
- Open the app once while online so the service worker can install and precache assets.
- Reload the app and confirm the browser reports an active service worker.
- Disable network access, then reload `/` and confirm the app shell still opens.
- Re-enable network access and confirm the app returns to normal online behavior.

## Icons

- Confirm `public/icon.svg`, `public/pwa-192.png`, and `public/pwa-512.png` are present before release.
- Confirm the install prompt and installed app use the EPUB Reader icon.
- Confirm the browser tab icon and Apple touch icon resolve to the PNG app icons.

## Reader Smoke Checks

- Import a small EPUB from the bookshelf.
- Open the imported book and confirm the first readable section renders.
- Navigate forward and backward between pages or sections.
- Open the table of contents and jump to another section.
- Change at least one appearance setting and confirm the reader updates without losing the current book.
- Close and reopen the app, then confirm the book remains available and reopens successfully.

## Final Checks

- Run `npm test`.
- Run `npm run build`.
- Record the browser, operating system, and device type used for install and offline verification in the release notes.
