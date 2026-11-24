#!/usr/bin/env python3
"""Record the user's requested outcomes for currently due app reviews."""

from __future__ import annotations

import copy
import json
from datetime import date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parent
SOURCE = Path("/Users/lhry716/Downloads/快速記憶法備份.json")
OUTPUT = ROOT / "快速記憶法備份_今天複習已記錄_20261021.json"
TZ = ZoneInfo("Asia/Taipei")
NOW = datetime(2026, 10, 21, 0, 17, 11, tzinfo=TZ)
STUDY_DAY = (NOW - timedelta(hours=5)).date()
NEXT_STUDY_DAY = STUDY_DAY + timedelta(days=1)
INTERVALS = [1, 3, 7, 14, 30, 30, 30]


def stamp(value: datetime) -> int:
    return int(value.timestamp() * 1000)


def from_ms(value: object) -> datetime | None:
    if isinstance(value, (int, float)) and value > 100_000_000_000:
        return datetime.fromtimestamp(value / 1000, TZ)
    return None


def study_start(day: date) -> datetime:
    return datetime.combine(day, time(5, 0), TZ)


def day_key(value: datetime) -> str:
    return (value - timedelta(hours=5)).date().isoformat()


def is_recovery(word: dict) -> bool:
    mastery = word.get("mastery") or {}
    return mastery.get("needsRecovery") is True or mastery.get("isRecoveryConfirmation") is True


def mastery_status(mastery: dict, stage: int) -> None:
    if mastery.get("needsRecovery") is True:
        mastery["status"] = "需加強"
    elif mastery.get("isRecoveryConfirmation") is True:
        mastery["status"] = "確認中"
    elif stage == 1:
        mastery["status"] = "已初學"
    elif stage <= 4:
        mastery["status"] = "學習中"
    elif stage <= 6:
        mastery["status"] = "熟悉"
    else:
        mastery["status"] = "穩定"


def main() -> None:
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    books = {b["id"] for b in data.get("books", [])}
    book_id = "ios-default-book"
    assert book_id in books, "Advanced English book not found"
    units = {u["id"]: u for u in data["units"] if u.get("bookId") == book_id}
    words = {w["id"]: w for w in data["words"]}
    groups = {g["id"]: g for g in data["studyGroups"]}
    schedules = data["groupReviewSchedules"]
    tests = data.get("tests", [])

    # Snapshot what the app currently considers due before applying any results.
    due_formal = []
    for group_id, schedule in schedules.items():
        group = groups.get(group_id)
        due_at = from_ms(schedule.get("nextDueAt"))
        if not group or group.get("unitId") not in units or due_at is None or due_at > NOW:
            continue
        word_ids = [
            word_id for word_id in group.get("wordIds", [])
            if word_id in words
            and words[word_id].get("initialDifficulty") is not None
            and not is_recovery(words[word_id])
        ]
        if word_ids:
            due_formal.append((group, schedule, word_ids))
    due_formal.sort(key=lambda item: (units[item[0]["unitId"]]["name"], item[0].get("groupNumber", 0)))

    due_recovery_by_unit: dict[str, list[str]] = {}
    completed_recovery_by_unit: dict[str, set[str]] = {}
    study_day_tests = [t for t in tests if from_ms(t.get("completedAt")) and day_key(from_ms(t["completedAt"])) == STUDY_DAY.isoformat()]
    for unit_id in units:
        completed_ids = {
            word_id
            for test in study_day_tests
            if test.get("unitId") == unit_id and str(test.get("scopeLabel", "")).startswith("Recovery 第")
            for word_id in test.get("wordIds", [])
        }
        completed_recovery_by_unit[unit_id] = completed_ids
        due_ids = [
            word["id"] for word in data["words"]
            if word.get("unitId") == unit_id
            and is_recovery(word)
            and from_ms((word.get("mastery") or {}).get("nextDueAt")) is not None
            and from_ms((word.get("mastery") or {}).get("nextDueAt")) <= NOW
        ]
        due_recovery_by_unit[unit_id] = due_ids

    recovery_batches = []
    for unit_id, unit in units.items():
        selected_ids = completed_recovery_by_unit[unit_id] | set(due_recovery_by_unit[unit_id])
        selected_words = sorted(
            (words[word_id] for word_id in selected_ids if word_id in words),
            key=lambda word: word.get("term", "").casefold(),
        )
        for offset in range(0, len(selected_words), 20):
            batch_no = offset // 20 + 1
            batch_words = selected_words[offset:offset + 20]
            batch_id = f"recovery-{unit_id}-{STUDY_DAY.isoformat()}-{batch_no}"
            batch_due_ids = [
                word["id"] for word in batch_words
                if is_recovery(word)
                and from_ms((word.get("mastery") or {}).get("nextDueAt")) is not None
                and from_ms((word.get("mastery") or {}).get("nextDueAt")) <= NOW
            ]
            if batch_due_ids:
                recovery_batches.append((unit, batch_no, batch_id, batch_due_ids))

    created_records = []

    # Complete all due formal groups with every first-round answer known.
    formal_base = datetime.combine(STUDY_DAY, time(6, 0), TZ)
    for index, (group, schedule, word_ids) in enumerate(due_formal):
        start = formal_base + timedelta(minutes=index * 2)
        responses = [
            {"at": stamp(start + timedelta(seconds=i * 2)), "known": True, "round": 1, "wordId": word_id}
            for i, word_id in enumerate(word_ids)
        ]
        completed = start + timedelta(seconds=max(5, len(word_ids) * 2))
        stage = max(1, min(7, int(schedule.get("stage") or 1)))
        next_stage = min(7, stage + 1)
        anchor = from_ms(schedule.get("reviewAnchorAt")) or study_start(STUDY_DAY)
        next_due = anchor + timedelta(days=INTERVALS[next_stage - 1])
        record = {
            "id": f"recorded-20261021-formal-{group['id']}",
            "unitId": group["unitId"],
            "groupId": group["id"],
            "groupLabel": f"第 {group['groupNumber']} 組",
            "scope": "group",
            "scopeLabel": f"第 {group['groupNumber']} 組今日到期複習",
            "testNumber": stage,
            "startedAt": stamp(start),
            "completedAt": stamp(completed),
            "wordIds": word_ids,
            "responses": responses,
            "rounds": [{
                "round": 1,
                "wordIds": word_ids,
                "known": len(word_ids),
                "unknown": 0,
                "completedAt": stamp(completed),
            }],
        }
        created_records.append(record)

        # Mirror the app's successful group-review result and persisted schedule.
        new_schedule = copy.deepcopy(schedule)
        new_schedule.update({
            "modelVersion": 9,
            "stage": next_stage,
            "nextDueAt": stamp(next_due),
            "hasPassedFinalReview": stage == 7,
        })
        schedules[group["id"]] = new_schedule
        first_answer_at = responses[0]["at"] if responses else stamp(completed)
        for word_id in word_ids:
            word = words[word_id]
            mastery = copy.deepcopy(word.get("mastery") or {})
            mastery.update({
                "modelVersion": 7,
                "stage": next_stage,
                "tests": int(mastery.get("tests") or 0) + 1,
                "qualifiedCount": max(int(mastery.get("qualifiedCount") or 0), next_stage - 1),
                "lastTestAt": first_answer_at,
                "lastScoredAt": first_answer_at,
                "lastScoredDay": day_key(from_ms(first_answer_at)),
                "lastTestCorrect": True,
                "needsRecovery": False,
                "isRecoveryConfirmation": False,
                "recoveryTargetStage": None,
                "hasPassedFinalReview": stage == 7,
                "nextDueAt": stamp(next_due),
            })
            mastery_status(mastery, next_stage)
            word["mastery"] = mastery

    # Complete due Recovery batches: round one all unknown, round two all known.
    recovery_base = datetime.combine(STUDY_DAY, time(7, 30), TZ)
    for index, (unit, batch_no, batch_id, word_ids) in enumerate(recovery_batches):
        start = recovery_base + timedelta(minutes=index * 3)
        responses = [
            {"at": stamp(start + timedelta(seconds=i * 2)), "known": False, "round": 1, "wordId": word_id}
            for i, word_id in enumerate(word_ids)
        ]
        round_two_start = start + timedelta(minutes=1)
        responses.extend(
            {"at": stamp(round_two_start + timedelta(seconds=i * 2)), "known": True, "round": 2, "wordId": word_id}
            for i, word_id in enumerate(word_ids)
        )
        completed = round_two_start + timedelta(seconds=max(5, len(word_ids) * 2))
        record = {
            "id": f"recorded-20261021-recovery-{unit['id']}-{batch_no}",
            "unitId": unit["id"],
            "groupId": batch_id,
            "groupLabel": f"Recovery 第 {batch_no} 組",
            "scope": "unit",
            "scopeLabel": f"Recovery 第 {batch_no} 組",
            "testNumber": 1,
            "startedAt": stamp(start),
            "completedAt": stamp(completed),
            "wordIds": word_ids,
            "responses": responses,
            "rounds": [
                {"round": 1, "wordIds": word_ids, "known": 0, "unknown": len(word_ids), "completedAt": stamp(start + timedelta(seconds=max(5, len(word_ids) * 2)))},
                {"round": 2, "wordIds": word_ids, "known": len(word_ids), "unknown": 0, "completedAt": stamp(completed)},
            ],
        }
        created_records.append(record)

        # The app scores only round one for Recovery. Thus all remain needsRecovery.
        for i, word_id in enumerate(word_ids):
            word = words[word_id]
            mastery = copy.deepcopy(word.get("mastery") or {})
            stage = max(1, min(7, int(mastery.get("stage") or 1)))
            target_stage = max(1, min(7, int(mastery.get("recoveryTargetStage") or stage)))
            first_answer_at = responses[i]["at"]
            mastery.update({
                "modelVersion": 7,
                "needsRecovery": True,
                "isRecoveryConfirmation": False,
                "recoveryTargetStage": target_stage,
                "tests": int(mastery.get("tests") or 0) + 1,
                "lastTestAt": first_answer_at,
                "lastScoredAt": first_answer_at,
                "lastScoredDay": STUDY_DAY.isoformat(),
                "lastTestCorrect": False,
                "nextDueAt": stamp(study_start(NEXT_STUDY_DAY)),
            })
            mastery_status(mastery, stage)
            word["mastery"] = mastery

    data["tests"] = sorted(tests + created_records, key=lambda test: test.get("completedAt", 0), reverse=True)
    latest_created = max((test["completedAt"] for test in created_records), default=0)
    if isinstance(data.get("updatedAt"), (int, float)):
        data["updatedAt"] = max(data["updatedAt"], latest_created)
    else:
        data["updatedAt"] = latest_created

    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    recovery_words = sum(len(batch[3]) for batch in recovery_batches)
    print(f"Wrote {OUTPUT}")
    print(f"Formal groups recorded: {len(due_formal)}; review answers all known")
    print(f"Recovery batches recorded: {len(recovery_batches)}; words: {recovery_words}; round 1 unknown, round 2 known")
    unit23 = next((unit for unit in units.values() if unit.get("name", "").startswith("Unit 23")), None)
    if unit23:
        unit23_words = [word for word in words.values() if word.get("unitId") == unit23["id"]]
        learned = sum(word.get("initialDifficulty") is not None for word in unit23_words)
        print(f"Unit 23 remains untouched: {learned} / {len(unit23_words)} learned")


if __name__ == "__main__":
    main()
