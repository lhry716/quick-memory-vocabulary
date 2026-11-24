#!/usr/bin/env python3
"""Create a read-only recovery snapshot from a QuickMemory JSON backup.

The source backup is never changed.  The output is deliberately a small,
human-readable JSON document that preserves the current recovery queue and
the words repeatedly missed in formal tests for the 進階英單 book.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


FREQUENT_ERROR_FIRST_ROUND_THRESHOLD = 2


def as_millis(value: Any) -> int | None:
    return int(value) if isinstance(value, (int, float)) else None


def iso_at(value: Any) -> str | None:
    millis = as_millis(value)
    if millis is None:
        return None
    return datetime.fromtimestamp(millis / 1000, timezone.utc).isoformat().replace("+00:00", "Z")


def word_view(word: dict[str, Any], stats: dict[str, Any]) -> dict[str, Any]:
    mastery = word.get("mastery") or {}
    return {
        "id": word["id"],
        "term": word.get("term", ""),
        "meaning": word.get("meaning", ""),
        "partOfSpeech": word.get("pos"),
        "kind": word.get("kind"),
        "initialDifficulty": word.get("initialDifficulty"),
        "errorStats": stats,
        "recoveryState": {
            "needsRecovery": mastery.get("needsRecovery", False),
            "isRecoveryConfirmation": mastery.get("isRecoveryConfirmation", False),
            "recoveryTargetStage": mastery.get("recoveryTargetStage"),
            "stage": mastery.get("stage"),
            "status": mastery.get("status"),
            "nextDueAt": iso_at(mastery.get("nextDueAt")),
            "lastTestCorrect": mastery.get("lastTestCorrect"),
            "lastTestAt": iso_at(mastery.get("lastTestAt")),
        },
        # Kept verbatim so a future repair can restore the word's actual
        # state, rather than trying to reconstruct it from a summary.
        "masteryBackup": mastery,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    raw = args.source.read_bytes()
    state = json.loads(raw)
    advanced_book = next((book for book in state.get("books", []) if book.get("name") == "進階英單"), None)
    if advanced_book is None:
        raise SystemExit("找不到名稱為「進階英單」的書籍。")

    book_id = advanced_book["id"]
    units = [unit for unit in state.get("units", []) if unit.get("bookId") == book_id]
    unit_ids = {unit["id"] for unit in units}
    words = [word for word in state.get("words", []) if word.get("unitId") in unit_ids]
    words_by_id = {word["id"]: word for word in words}
    groups_by_unit: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for group in state.get("studyGroups", []):
        if group.get("unitId") in unit_ids:
            groups_by_unit[group["unitId"]].append(group)

    # Count first-round failures per distinct test, instead of counting retry
    # rounds as separate mistakes. This is the least noisy definition of
    # "frequently wrong" and remains usable when recovery rules change.
    per_word: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "firstRoundWrongTestCount": 0,
        "allWrongAnswerCount": 0,
        "lastWrongAt": None,
        "testIds": [],
    })
    for test in state.get("tests", []):
        first_responses: dict[str, dict[str, Any]] = {}
        for response in test.get("responses", []):
            word_id = response.get("wordId")
            if word_id not in words_by_id:
                continue
            if response.get("known") is False:
                stats = per_word[word_id]
                stats["allWrongAnswerCount"] += 1
                when = as_millis(response.get("at"))
                if when is not None and (stats["lastWrongAt"] is None or when > stats["lastWrongAt"]):
                    stats["lastWrongAt"] = when
            if response.get("round") == 1 and word_id not in first_responses:
                first_responses[word_id] = response
        for word_id, response in first_responses.items():
            if response.get("known") is False:
                stats = per_word[word_id]
                stats["firstRoundWrongTestCount"] += 1
                stats["testIds"].append(test.get("id"))

    for stats in per_word.values():
        stats["lastWrongAt"] = iso_at(stats["lastWrongAt"])

    schedules = state.get("groupReviewSchedules") or {}
    lessons: list[dict[str, Any]] = []
    all_recovery = 0
    all_frequent = 0
    overdue_recovery = 0
    snapshot_time = as_millis(state.get("updatedAt")) or int(datetime.now(tz=timezone.utc).timestamp() * 1000)

    for unit in sorted(units, key=lambda item: item.get("name", "")):
        unit_words = [word for word in words if word.get("unitId") == unit["id"]]
        recovery_words = []
        frequent_words = []
        for word in unit_words:
            mastery = word.get("mastery") or {}
            stats = per_word[word["id"]]
            if mastery.get("needsRecovery") or mastery.get("isRecoveryConfirmation"):
                recovery_words.append(word_view(word, stats))
                all_recovery += 1
                due = as_millis(mastery.get("nextDueAt"))
                if due is not None and due <= snapshot_time:
                    overdue_recovery += 1
            if stats["firstRoundWrongTestCount"] >= FREQUENT_ERROR_FIRST_ROUND_THRESHOLD:
                frequent_words.append(word_view(word, stats))
                all_frequent += 1

        group_schedules = []
        for group in sorted(groups_by_unit[unit["id"]], key=lambda item: item.get("groupNumber", 0)):
            schedule = schedules.get(group.get("id"))
            group_schedules.append({
                "groupId": group.get("id"),
                "groupNumber": group.get("groupNumber"),
                "wordCount": len(group.get("wordIds") or []),
                "schedule": None if schedule is None else {
                    "stage": schedule.get("stage"),
                    "nextDueAt": iso_at(schedule.get("nextDueAt")),
                    "hasPassedFinalReview": schedule.get("hasPassedFinalReview", False),
                },
                "scheduleBackup": schedule,
            })

        lessons.append({
            "unitId": unit["id"],
            "unitName": unit.get("name"),
            "wordCount": len(unit_words),
            "groupSchedules": group_schedules,
            "recoveryWords": sorted(recovery_words, key=lambda item: (item["recoveryState"]["nextDueAt"] or "", item["term"])),
            "frequentlyWrongWords": sorted(frequent_words, key=lambda item: (-item["errorStats"]["firstRoundWrongTestCount"], item["term"])),
        })

    output = {
        "format": "quick-memory-advanced-vocabulary-recovery-snapshot",
        "formatVersion": 1,
        "purpose": "Recovery restoration source; not an importable app backup.",
        "source": {
            "filename": args.source.name,
            "sha256": hashlib.sha256(raw).hexdigest(),
            "backupVersion": state.get("version"),
            "backupUpdatedAt": iso_at(state.get("updatedAt")),
            "bookId": book_id,
            "bookName": advanced_book["name"],
        },
        "definitions": {
            "recovery": "needsRecovery=true or isRecoveryConfirmation=true in the source backup.",
            "frequentlyWrong": f"Failed the first round in {FREQUENT_ERROR_FIRST_ROUND_THRESHOLD} or more distinct test records; retry rounds do not inflate this count.",
        },
        "summary": {
            "lessonCount": len(lessons),
            "wordCount": len(words),
            "recoveryWordCount": all_recovery,
            "overdueRecoveryWordCountAtBackupTime": overdue_recovery,
            "frequentlyWrongWordCount": all_frequent,
        },
        "lessons": lessons,
    }
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
