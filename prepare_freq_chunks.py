with open("/tmp/excludes.txt", "r") as f:
    excludes = set(w.strip() for w in f.read().split(","))

freq_words = []
with open("/tmp/de_top_5000.txt", "r", encoding="utf-8") as f:
    for line in f:
        parts = line.strip().split()
        if parts:
            w = parts[0].strip().lower()
            if len(w) >= 3 and w.isalpha() and w not in excludes:
                freq_words.append(w)

chunk_size = 400
for i in range(29):
    file_idx = i + 22
    start = i * chunk_size
    end = start + chunk_size
    chunk = freq_words[start:end]
    
    with open(f"/tmp/freq_chunk_{file_idx}.txt", "w", encoding="utf-8") as f:
        f.write(", ".join(chunk))
