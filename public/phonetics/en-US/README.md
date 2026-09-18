# General American IPA dictionary

Source: https://github.com/open-dict-data/ipa-dict
Pinned revision: 43c3570eb3553bdd19fccd2bd0091534889af023
Data: data/en_US.txt (General American English, derived from CMUdict).

Regenerate from the repository root with `python3 scripts/build-ipa-dictionary.py`.
All alternative pronunciations are retained. Entries are split by initial letter
and fetched on demand. The PWA caches fetched shards for offline reuse;
letters that have never been fetched still require a network connection.
If updating dictionary content, bump the v1 directory, service URL, and cache name.

See LICENSE-ipa-dict.txt (MIT) and LICENSE-cmudict.txt (BSD-2-Clause).
Upstream credits the MIT-licensed cmudict-ipa and syllabify projects:
https://github.com/lingz/cmudict-ipa
https://github.com/kylebgorman/syllabify
