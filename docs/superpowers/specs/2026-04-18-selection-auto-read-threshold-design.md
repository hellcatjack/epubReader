# Selection Auto-Read Threshold Design

**Goal**

When a user makes a mouse-driven text selection, selections with more than `30` English letters (`A-Z`, case-insensitive) should still auto-translate but should no longer auto-trigger browser read aloud.

**Scope**

- Keep automatic translation unchanged.
- Keep manual `Read aloud` unchanged.
- Keep continuous `Start TTS` unchanged.
- Apply the threshold only to the released-selection auto-read path.

**Design**

- Add a small helper in `ReaderPage.tsx` that counts English letters with `/[A-Za-z]/g`.
- Reuse the existing released-selection auto-read branch and gate `isAutoSpeakableSelection(...)` with the new threshold.
- Treat `30` letters as allowed and `31+` as blocked.
- Leave punctuation, spaces, digits, and non-Latin text out of the count.

**Testing**

- Add a unit regression proving `31` letters still auto-translate but do not call browser speech synthesis.
- Add a boundary regression proving `30` letters still auto-read.
