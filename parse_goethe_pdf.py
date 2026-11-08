import sys
import os
import re
import json
import pandas as pd

def clean_entry(raw_word, raw_info="", raw_example="", level="A1"):
    raw_word = str(raw_word).strip() if raw_word else ""
    raw_info = str(raw_info).strip() if raw_info else ""
    raw_example = str(raw_example).strip() if raw_example else ""
    
    # Игнорируем пустые строки, колонтитулы и заголовки алфавита
    if not raw_word or raw_word.lower() in ["wort", "stichwort", "wortschatz", "seite", "beispielsatz"]:
        return None
    if len(raw_word) == 1 and raw_word.isupper():
        return None
    if any(h in raw_word for h in ["Goethe-Zertifikat", "Start Deutsch", "Wortliste"]):
        return None
        
    art = "-"
    pl = "-"
    pos = "Wort"
    lem = raw_word
    
    # 1. Существительные с артиклем: der/die/das
    noun_match = re.match(r'^(der|die|das)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-\/]+)(?:,\s*([^\s]+|\(Sg\.\)|\(Pl\.\)))?', raw_word)
    if noun_match:
        art = noun_match.group(1)
        lem = noun_match.group(2)
        pl = noun_match.group(3) or "-"
        pos = "Nomen"
    elif raw_word[0].isupper() and (raw_info.startswith("N.") or "Nomen" in raw_info or "(Sg.)" in raw_word):
        pos = "Nomen"
        lem = re.sub(r'\s*\(.*?\)', '', raw_word).strip()
        if "(Sg.)" in raw_word or "Sg." in raw_info:
            pl = "nur Sg."
        elif "(Pl.)" in raw_word or "Pl." in raw_info:
            pl = "nur Pl."
            
    # Убираем женские дубли через слэш (например, "der Arzt / die Ärztin" -> "Arzt")
    if "/" in lem and art != "-":
        lem = lem.split("/")[0].strip()
        
    # 2. Глаголы
    if raw_info.startswith("V.") or "Verb" in raw_info or (lem.endswith(('en', 'eln', 'ern')) and lem[0].islower()):
        pos = "Verb"
        lem = lem.split(",")[0].strip()
        
    # 3. Прилагательные
    elif raw_info.startswith("Adj.") or "Adjektiv" in raw_info:
        pos = "Adjektiv"
        
    # Нормализация Sg. и Pl.
    if "Sg" in pl:
        pl = "nur Sg."
    elif "Pl" in pl:
        pl = "nur Pl."
        
    # Очистка примера от остатков женских форм (/ die ...)
    ex = re.sub(r'^(?:/\s*die\s+[^\s]+(?:\s*,\s*[^\s]+)?\s*)', '', raw_example).strip()
    # Убираем перенос строки внутри примера
    ex = " ".join(ex.split())
    
    return {
        'lemma': lem,
        'article': art,
        'plural': pl,
        'pos': pos,
        'example': ex,
        'level': level
    }

def parse_with_pdfplumber(pdf_path, level):
    import pdfplumber
    cards = []
    print(f"📖 Читаем через pdfplumber: {pdf_path}...")
    
    with pdfplumber.open(pdf_path) as pdf:
        for p_idx, page in enumerate(pdf.pages):
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    if not row or len(row) < 2:
                        continue
                    
                    # Если таблица из 2 колонок: [Слово, Пример]
                    if len(row) == 2:
                        word, example = row[0], row[1]
                        info = ""
                    # Если из 3+ колонок: [Слово, Часть речи / Формы, Пример]
                    else:
                        word, info, example = row[0], row[1], row[2]
                        
                    card = clean_entry(word, info, example, level)
                    if card:
                        cards.append(card)
    return cards

def parse_with_pypdf(pdf_path, level):
    import pypdf
    cards = []
    print(f"📖 Читаем через pypdf (fallback): {pdf_path}...")
    reader = pypdf.PdfReader(pdf_path)
    
    for page in reader.pages:
        text = page.extract_text()
        if not text:
            continue
        for line in text.split("\n"):
            line = line.strip()
            # Пытаемся разделить строку на слово и пример
            m = re.match(r'^((?:der|die|das\s+)?[a-zA-ZäöüÄÖÜß\-\/]+(?:\s*,\s*[^\s]+)?)\s+([A-ZÄÖÜ].*)$', line)
            if m:
                card = clean_entry(m.group(1), "", m.group(2), level)
                if card:
                    cards.append(card)
    return cards

def main():
    if len(sys.argv) < 2:
        print("Использование: ./.venv/bin/python parse_goethe_pdf.py <файл.pdf> [уровень: A1/A2/B1/B2/C1]")
        return
        
    pdf_path = sys.argv[1]
    if not os.path.exists(pdf_path):
        print(f"❌ Файл не найден: {pdf_path}")
        return
        
    # Автоопределение уровня из имени файла, если не передан аргументом
    level = "A1"
    if len(sys.argv) >= 3:
        level = sys.argv[2].upper()
    else:
        for lvl in ["C1", "B2", "B1", "A2", "A1"]:
            if lvl in pdf_path.upper():
                level = lvl
                break

    # Парсинг: приоритет pdfplumber (для таблиц), при отсутствии — pypdf
    try:
        import pdfplumber
        cards = parse_with_pdfplumber(pdf_path, level)
    except ImportError:
        cards = parse_with_pypdf(pdf_path, level)
        
    if not cards:
        print("⚠️ Не удалось извлечь слова. Проверьте формат PDF.")
        return

    # Удаляем дубликаты лемм
    df = pd.DataFrame(cards)
    df = df.drop_duplicates(subset=['lemma', 'article'])
    
    base_name = os.path.splitext(os.path.basename(pdf_path))[0]
    out_csv = f"{base_name}_clean.csv"
    out_json = f"{base_name}_clean.json"
    
    df.to_csv(out_csv, index=False, encoding="utf-8")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(df.to_dict(orient="records"), f, ensure_ascii=False, indent=2)
        
    print(f"\n Успешно извлечено: {len(df)} слов уровня {level}!")
    print(f" Сохранено в:\n  - {out_csv}\n  - {out_json}")
    print("\nПример первых 3 строк:")
    print(df[['lemma', 'article', 'plural', 'pos', 'example']].head(3).to_string(index=False))

if __name__ == "__main__":
    main()