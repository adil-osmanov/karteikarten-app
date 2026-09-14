import re
with open("/tmp/excludes.txt", "r") as f:
    excludes = set(w.strip() for w in f.read().split(","))

freq_words = []
with open("/tmp/de_top_5000.txt", "r", encoding="utf-8") as f:
    for line in f:
        parts = line.strip().split()
        if parts:
            w = parts[0].strip().lower()
            if len(w) >= 4 and w.isalpha() and w not in excludes:
                freq_words.append(w)

with open("/tmp/filtered_top.txt", "w") as f:
    for w in freq_words[:50]:
        f.write(w + "\n")
print(f"Total available filtered words: {len(freq_words)}")
