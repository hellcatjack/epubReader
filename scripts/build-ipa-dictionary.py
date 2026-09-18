"""Regenerate committed en-US shards from the pinned upstream word list."""
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

REVISION = "43c3570eb3553bdd19fccd2bd0091534889af023"
URL = f"https://raw.githubusercontent.com/open-dict-data/ipa-dict/{REVISION}/data/en_US.txt"
output = Path(__file__).resolve().parents[1] / "public/phonetics/en-US/v1"
output.mkdir(parents=True, exist_ok=True)
data = urlopen(URL).read()
shards = {letter: {} for letter in "abcdefghijklmnopqrstuvwxyz"}
for line in data.decode("utf-8").splitlines():
    word, ipa = line.split("\t", 1)
    word = word.lower()
    if word and word[0] in shards:
        shards[word[0]][word] = ipa
for letter, entries in shards.items():
    (output / f"{letter}.json").write_text(json.dumps(entries, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
print(f"Generated {sum(map(len, shards.values()))} entries; source SHA256 {hashlib.sha256(data).hexdigest()}")
