#!/usr/bin/env python3
"""Add Theme 4 historical-civilization vocabulary to the Shengjing backup."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import openpyxl


BASE = Path("快速記憶法備份 2_晟景已補中文.json")
SOURCE = Path("/Users/lhry716/Downloads/主題四_歷史文明_單字整理.xlsx")
OUTPUT = Path("快速記憶法備份 9_晟景主題四已匯入.json")
BOOK_ID = "shengjing-cloze"
CREATED_AT = int(datetime.now(ZoneInfo("Asia/Taipei")).timestamp() * 1000)
ROUND_NUMBERS = {"第一回": 1, "第二回": 2, "第三回": 3, "第四回": 4}


def extract_rows() -> dict[int, list[dict[str, str]]]:
    workbook = openpyxl.load_workbook(SOURCE, data_only=True, read_only=True)
    sheet = workbook.active
    results: dict[int, list[dict[str, str]]] = {number: [] for number in ROUND_NUMBERS.values()}

    for row in sheet.iter_rows(min_row=5, values_only=True):
        round_name, _page, term, pos, meaning = (list(row) + [None] * 5)[:5]
        if not term:
            continue
        number = ROUND_NUMBERS.get(str(round_name).strip())
        if number is None:
            raise ValueError(f"Unknown round name: {round_name!r}")
        results[number].append({
            "term": str(term).strip(),
            "pos": str(pos).strip() if pos else "",
            "meaning": str(meaning).strip() if meaning else "（待補中文）",
        })

    if any(not terms for terms in results.values()):
        raise ValueError("One or more Theme 4 rounds has no vocabulary.")
    return results


def main() -> None:
    data = json.loads(BASE.read_text(encoding="utf-8"))
    rows_by_round = extract_rows()
    unit_ids = {f"shengjing-t4-r{number}" for number in ROUND_NUMBERS.values()}

    if any(unit.get("id") in unit_ids for unit in data.get("units", [])):
        raise ValueError("Theme 4 is already present in the selected backup.")
    if any(word.get("id", "").startswith("shengjing-t4-") for word in data.get("words", [])):
        raise ValueError("Theme 4 word IDs already exist in the selected backup.")

    added_units: list[dict] = []
    added_words: list[dict] = []
    added_groups: list[dict] = []

    for round_name, round_number in ROUND_NUMBERS.items():
        unit_id = f"shengjing-t4-r{round_number}"
        pairs = rows_by_round[round_number]
        word_ids: list[str] = []

        for index, item in enumerate(pairs, start=1):
            word_id = f"{unit_id}-w{index:03d}"
            word_ids.append(word_id)
            word = {
                "id": word_id,
                "unitId": unit_id,
                "term": item["term"],
                "meaning": item["meaning"],
                "anchor": item["term"],
                "kind": "主單字",
                "createdAt": CREATED_AT,
            }
            if item["pos"]:
                word["pos"] = item["pos"]
            added_words.append(word)

        added_units.append({
            "id": unit_id,
            "bookId": BOOK_ID,
            "name": f"主題四 {round_name}",
            "note": "歷史文明；依單字整理檔匯入，已含中文釋義",
            "source": SOURCE.name,
            "createdAt": CREATED_AT,
        })
        for start in range(0, len(word_ids), 20):
            group_number = start // 20 + 1
            added_groups.append({
                "id": f"{unit_id}-g{group_number:02d}",
                "unitId": unit_id,
                "groupNumber": group_number,
                "createdAt": CREATED_AT,
                "wordIds": word_ids[start:start + 20],
            })

    data.setdefault("units", []).extend(added_units)
    data.setdefault("words", []).extend(added_words)
    data.setdefault("studyGroups", []).extend(added_groups)
    data["updatedAt"] = CREATED_AT
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({
        "output": str(OUTPUT),
        "units": len(added_units),
        "words": len(added_words),
        "groups": len(added_groups),
        "per_round": {f"主題四 {name}": len(rows_by_round[number]) for name, number in ROUND_NUMBERS.items()},
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
