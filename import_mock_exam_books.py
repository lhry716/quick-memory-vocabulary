"""Import the two supplied mock-exam word lists as a third book in the clean backup."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import openpyxl


BASE = Path("/Users/lhry716/Documents/快速記憶法/快速記憶法備份 7_九天完整複習_清理版.json")
OUTPUT = Path("/Users/lhry716/Documents/快速記憶法/快速記憶法備份 7_九天完整複習_含模擬考.json")
SOURCES = [
    ("mock-111-e2", "111-E2 全模", Path("/Users/lhry716/Downloads/111-E2_全模_單字整理.xlsx")),
    ("mock-es5b12-1", "ES5B12-1", Path("/Users/lhry716/Downloads/ES5B12-1_單字整理.xlsx")),
]
BOOK = {"id": "mock-exams", "name": "模擬考單字"}
CREATED_AT = int(datetime(2026, 9, 30, 20, 0, tzinfo=ZoneInfo("Asia/Taipei")).timestamp() * 1000)


def extract_words(path: Path) -> list[tuple[str, str]]:
    workbook = openpyxl.load_workbook(path, data_only=True, read_only=True)
    sheet = workbook.active
    results: list[tuple[str, str]] = []
    header_seen = False
    for row in sheet.iter_rows(values_only=True):
        first = row[0] if len(row) > 0 else None
        second = row[1] if len(row) > 1 else None
        term = str(first).strip() if first is not None else ""
        meaning = str(second).strip() if second is not None else ""
        if term == "單字／片語" and meaning == "中文意思":
            header_seen = True
            continue
        if not header_seen or not term or not meaning:
            continue
        results.append((term, meaning))
    if not results:
        raise ValueError(f"No word rows found in {path}")
    return results


def make_groups(unit_id: str, word_ids: list[str]) -> list[dict]:
    return [
        {
            "id": f"{unit_id}-g{index // 20 + 1:02d}",
            "unitId": unit_id,
            "groupNumber": index // 20 + 1,
            "createdAt": CREATED_AT,
            "wordIds": word_ids[index:index + 20],
        }
        for index in range(0, len(word_ids), 20)
    ]


def main() -> None:
    data = json.loads(BASE.read_text(encoding="utf-8"))
    if any(book.get("id") == BOOK["id"] for book in data.get("books", [])):
        raise ValueError("The mock-exam book already exists in the input backup.")

    data.setdefault("books", []).append(BOOK)
    added_units: list[dict] = []
    added_words: list[dict] = []
    added_groups: list[dict] = []

    for unit_id, unit_name, source in SOURCES:
        pairs = extract_words(source)
        word_ids = []
        for number, (term, meaning) in enumerate(pairs, start=1):
            word_id = f"{unit_id}-w{number:03d}"
            word_ids.append(word_id)
            added_words.append({
                "id": word_id,
                "unitId": unit_id,
                "term": term,
                "meaning": meaning,
                "anchor": term,
                "kind": "主單字",
                "createdAt": CREATED_AT,
            })
        added_units.append({
            "id": unit_id,
            "bookId": BOOK["id"],
            "name": unit_name,
            "note": "模擬考單字／片語；尚未開始",
            "source": source.name,
            "createdAt": CREATED_AT,
        })
        added_groups.extend(make_groups(unit_id, word_ids))

    data.setdefault("units", []).extend(added_units)
    data.setdefault("words", []).extend(added_words)
    data.setdefault("studyGroups", []).extend(added_groups)
    data["updatedAt"] = CREATED_AT
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(OUTPUT)
    for unit, source in zip(added_units, SOURCES):
        count = sum(1 for word in added_words if word["unitId"] == unit["id"])
        groups = sum(1 for group in added_groups if group["unitId"] == unit["id"])
        print(f"{source[1]}: {count} words, {groups} groups")


if __name__ == "__main__":
    main()
