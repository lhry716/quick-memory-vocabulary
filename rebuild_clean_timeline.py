"""Build a compact, synthetic-but-schema-compatible learning backup.

The original backup stays untouched.  Unit 1–9 are introduced on nine
consecutive days and each group completes D1/D3/D7/D14/D30 on its due date.
Past errors are represented only through the initial difficulty of each word:
A = no recorded miss, B = one miss, C = repeated miss or Recovery history.
"""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo


SOURCE = Path("/Users/lhry716/Downloads/快速記憶法備份 7.json")
OUTPUT = Path("/Users/lhry716/Documents/快速記憶法/快速記憶法備份 7_九天完整複習_清理版.json")
REPORT = Path("/Users/lhry716/Documents/快速記憶法/快速記憶法備份 7_九天完整複習_清理版說明.json")
TZ = ZoneInfo("Asia/Taipei")

# Unit 1 begins nine days before the final initial-study day.  This is a
# nine-day history, not a thirty-day one: only checkpoints that have actually
# become due by 2026-09-30 are recorded.
LAST_STUDY_DAY = datetime(2026, 9, 30, 9, 0, tzinfo=TZ)
UNIT_IDS = [
    "msnfyqqt-lsuyfo2",
    "msocc9zp-8l5ugdl",
    "msocc9zp-tgoyqsr",
    "import-unit-4",
    "import-unit-5",
    "import-unit-6",
    "import-unit-7",
    "import-unit-8",
    "import-unit-9",
]
INTERVALS = [(1, "D1"), (3, "D3"), (7, "D7"), (14, "D14"), (30, "D30")]


def ms(value: datetime) -> int:
    return int(value.timestamp() * 1000)


def study_day_start(value: datetime) -> datetime:
    return value.replace(hour=5, minute=0, second=0, microsecond=0)


def record_misses(records: list[dict], misses: Counter[str]) -> None:
    for record in records:
        if not isinstance(record, dict):
            continue
        for response in record.get("responses") or []:
            if isinstance(response, dict) and response.get("known") is False:
                word_id = response.get("wordId")
                if isinstance(word_id, str):
                    misses[word_id] += 1


def difficulty_for(word_id: str, misses: Counter[str], recovery_ids: set[str]) -> str:
    if word_id in recovery_ids or misses[word_id] >= 2:
        return "C"
    if misses[word_id] == 1:
        return "B"
    return "A"


def initial_learning(word_id: str, difficulty: str, completed: datetime) -> dict:
    # A/B/C preserve the historical error signal without copying noisy attempts.
    responses = []
    if difficulty == "A":
        responses.append({"at": ms(completed), "known": True, "round": 1, "wordId": word_id})
    elif difficulty == "B":
        responses.extend([
            {"at": ms(completed), "known": False, "round": 1, "wordId": word_id},
            {"at": ms(completed + timedelta(seconds=8)), "known": True, "round": 2, "wordId": word_id},
        ])
    else:
        responses.extend([
            {"at": ms(completed), "known": False, "round": 1, "wordId": word_id},
            {"at": ms(completed + timedelta(seconds=8)), "known": False, "round": 2, "wordId": word_id},
            {"at": ms(completed + timedelta(seconds=16)), "known": True, "round": 3, "wordId": word_id},
        ])
    return {"completedAt": ms(completed + timedelta(seconds=(len(responses) - 1) * 8)), "rounds": responses}


def mastery(
    anchor: datetime,
    last_review: datetime | None,
    next_due: datetime,
    stage: int,
    tests: int,
    needs_recovery: bool = False,
    recovery_target_stage: int | None = None,
) -> dict:
    if needs_recovery:
        status = "需加強"
    elif stage == 1:
        status = "已初學"
    elif stage <= 4:
        status = "學習中"
    else:
        status = "熟悉"
    return {
        "hasPassedFinalReview": False,
        "isRecoveryConfirmation": False,
        "lastScoredAt": ms(last_review) if last_review else None,
        "lastScoredDay": last_review.date().isoformat() if last_review else None,
        "lastTestAt": ms(last_review) if last_review else None,
        "lastTestCorrect": False if needs_recovery else (True if last_review else None),
        "modelVersion": 7,
        "needsRecovery": needs_recovery,
        "nextDueAt": ms(next_due),
        "qualifiedCount": max(0, tests - 1) if needs_recovery else tests,
        "recoveryTargetStage": recovery_target_stage if needs_recovery else None,
        "reviewAnchorAt": ms(anchor),
        "stage": stage,
        "status": status,
        "tests": tests,
    }


def learning_session(group: dict, words: list[dict], completed: datetime, difficulty: dict[str, str]) -> dict:
    responses = []
    counts = Counter()
    for offset, word in enumerate(words):
        word_id = word["id"]
        level = difficulty[word_id]
        counts[level] += 1
        responses.extend(word["initialLearning"]["rounds"])
    started = completed - timedelta(minutes=max(2, len(words)))
    return {
        "id": f"clean-learning-{group['id']}",
        "unitId": group["unitId"],
        "groupId": group["id"],
        "batchNumber": group.get("groupNumber", 1),
        "startedAt": ms(started),
        "completedAt": ms(completed),
        "wordIds": [word["id"] for word in words],
        "responses": sorted(responses, key=lambda item: item["at"]),
        "counts": {"A": counts["A"], "B": counts["B"], "C": counts["C"]},
    }


def formal_review(group: dict, words: list[dict], due: datetime, stage: int, label: str, retry_word_ids: set[str], is_today: bool) -> dict:
    started = due.replace(hour=19, minute=0, second=0, microsecond=0)
    first_round = [
        {"at": ms(started + timedelta(seconds=index * 3)), "known": word["id"] not in retry_word_ids, "round": 1, "wordId": word["id"]}
        for index, word in enumerate(words)
    ]
    retry_words = [word for word in words if word["id"] in retry_word_ids]
    second_round_start = started + timedelta(seconds=max(1, len(words) * 3))
    second_round = [
        {"at": ms(second_round_start + timedelta(seconds=index * 3)), "known": False, "round": 2, "wordId": word["id"]}
        for index, word in enumerate(retry_words)
    ]
    third_round_start = second_round_start + timedelta(seconds=max(1, len(retry_words) * 3))
    third_round = [
        {"at": ms(third_round_start + timedelta(seconds=index * 3)), "known": True, "round": 3, "wordId": word["id"]}
        for index, word in enumerate(retry_words)
    ]
    responses = first_round + second_round + third_round
    completed = third_round_start + timedelta(seconds=max(1, len(retry_words) * 3))
    rounds = [{"round": 1, "wordIds": [word["id"] for word in words], "known": len(words) - len(retry_words), "unknown": len(retry_words), "completedAt": ms(completed)}]
    if retry_words:
        rounds.append({"round": 2, "wordIds": [word["id"] for word in retry_words], "known": 0, "unknown": len(retry_words), "completedAt": ms(completed)})
        rounds.append({"round": 3, "wordIds": [word["id"] for word in retry_words], "known": len(retry_words), "unknown": 0, "completedAt": ms(completed)})
    return {
        "id": f"clean-review-{group['id']}-d{INTERVALS[stage - 1][0]}",
        "unitId": group["unitId"],
        "groupId": group["id"],
        "groupLabel": f"第 {group.get('groupNumber', 1)} 組",
        "scope": "group",
        "scopeLabel": (
            f"今日到期複習 · 第 {group.get('groupNumber', 1)} 組 · {label} 複習"
            if is_today else f"第 {group.get('groupNumber', 1)} 組 · {label} 複習"
        ),
        "testNumber": stage,
        "startedAt": ms(started),
        "completedAt": ms(completed),
        "wordIds": [word["id"] for word in words],
        "responses": responses,
        "rounds": rounds,
    }


def source_frequently_wrong_ids(records: list[dict]) -> set[str]:
    """Preserve prior 常錯字, while also applying the new round-3 rule."""
    by_unit: dict[str, list[dict]] = {}
    for record in records:
        if isinstance(record, dict) and isinstance(record.get("unitId"), str):
            by_unit.setdefault(record["unitId"], []).append(record)
    result: set[str] = set()
    for unit_records in by_unit.values():
        first_round_success: dict[str, int] = {}
        retry_streak: dict[str, int] = {}
        for record in sorted(unit_records, key=lambda item: item.get("completedAt") or 0):
            by_word: dict[str, list[dict]] = {}
            for response in record.get("responses") or []:
                if isinstance(response, dict) and isinstance(response.get("wordId"), str):
                    by_word.setdefault(response["wordId"], []).append(response)
            for word_id, responses in by_word.items():
                first = next((response for response in responses if response.get("round") == 1), None)
                if first is None:
                    continue
                if first.get("known") is True:
                    first_round_success[word_id] = first_round_success.get(word_id, 0) + 1
                    retry_streak[word_id] = 0
                    if first_round_success[word_id] == 3:
                        result.discard(word_id)
                else:
                    first_round_success[word_id] = 0
                last_round = max((response.get("round") or 0 for response in responses), default=0)
                # Round 3 is now immediately 常錯. The legacy repeated-retry
                # condition is retained only while rebuilding, so a word that
                # was already shown in 常錯字 does not disappear on re-import.
                if last_round >= 3:
                    result.add(word_id)
                if last_round > 1:
                    retry_streak[word_id] = retry_streak.get(word_id, 0) + 1
                    if retry_streak[word_id] >= 2:
                        result.add(word_id)
    return result


def main() -> None:
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    original_words = data["words"]

    misses: Counter[str] = Counter()
    record_misses(data.get("learningSessions") or [], misses)
    record_misses(data.get("relearningSessions") or [], misses)
    record_misses(data.get("tests") or [], misses)
    recovery_ids = {
        word["id"]
        for word in original_words
        if isinstance(word.get("mastery"), dict)
        and (word["mastery"].get("needsRecovery") or word["mastery"].get("isRecoveryConfirmation"))
    }
    frequently_wrong_ids = source_frequently_wrong_ids(data.get("tests") or []) | recovery_ids

    unit_start = {
    unit_id: LAST_STUDY_DAY - timedelta(days=len(UNIT_IDS) - 1 - index)
        for index, unit_id in enumerate(UNIT_IDS)
    }
    words_by_id = {word["id"]: word for word in original_words}
    groups = [group for group in data.get("studyGroups", []) if group.get("unitId") in UNIT_IDS]
    groups_by_unit: dict[str, list[dict]] = {unit_id: [] for unit_id in UNIT_IDS}
    for group in groups:
        groups_by_unit[group["unitId"]].append(group)

    # Unit 9 in the source export used ephemeral generated batches and therefore
    # has no entries in studyGroups.  Materialize normal 20-word groups so its
    # fresh timeline can receive the same due-review sequence as Units 1–8.
    for unit_id in UNIT_IDS:
        if groups_by_unit[unit_id]:
            continue
        unit_words = [word for word in original_words if word.get("unitId") == unit_id]
        for offset in range(0, len(unit_words), 20):
            number = offset // 20 + 1
            group = {
                "id": f"clean-{unit_id}-g{number:02d}",
                "unitId": unit_id,
                "groupNumber": number,
                "createdAt": ms(unit_start[unit_id]),
                "wordIds": [word["id"] for word in unit_words[offset:offset + 20]],
            }
            groups.append(group)
            groups_by_unit[unit_id].append(group)
            data.setdefault("studyGroups", []).append(group)
    for group_list in groups_by_unit.values():
        group_list.sort(key=lambda group: group.get("groupNumber", 0))

    # All remaining units must also own fixed JSON groups.  They stay entirely
    # unstarted—no mastery, sessions, schedules, or synthetic reviews are
    # added—but the App no longer has to invent their batches.  The source
    # already includes fixed groups for all three 晟景 units; Unit 10 is the
    # only remaining unit that needs these records.
    grouped_unit_ids = {group.get("unitId") for group in data.get("studyGroups", [])}
    for unit in data.get("units", []):
        unit_id = unit.get("id")
        if not isinstance(unit_id, str) or unit_id in grouped_unit_ids:
            continue
        unit_words = [word for word in original_words if word.get("unitId") == unit_id]
        for offset in range(0, len(unit_words), 20):
            number = offset // 20 + 1
            group = {
                "id": f"clean-{unit_id}-g{number:02d}",
                "unitId": unit_id,
                "groupNumber": number,
                "createdAt": unit.get("createdAt", data.get("createdAt")),
                "wordIds": [word["id"] for word in unit_words[offset:offset + 20]],
            }
            data.setdefault("studyGroups", []).append(group)
        grouped_unit_ids.add(unit_id)

    # Remove every old activity and reset all Unit 1–9 words before creating the new timeline.
    for word in original_words:
        if word.get("unitId") not in UNIT_IDS:
            continue
        word_id = word["id"]
        started = unit_start[word["unitId"]]
        level = difficulty_for(word_id, misses, recovery_ids)
        word["createdAt"] = ms(started)
        word["initialDifficulty"] = level
        word["initialLearning"] = initial_learning(word_id, level, started.replace(hour=9, minute=0))

    learning_sessions: list[dict] = []
    test_records: list[dict] = []
    schedules: dict[str, dict] = {}
    difficulty_map = {word["id"]: word.get("initialDifficulty") for word in original_words}

    for unit_index, unit_id in enumerate(UNIT_IDS):
        started = unit_start[unit_id]
        anchor = study_day_start(started)
        # Every checkpoint through today is complete on time.  Today's records
        # carry the App's explicit "今日到期複習" label so groups appear as
        # completed rather than disappearing from the day view.
        due_checkpoints = [
            (offset, label) for offset, label in INTERVALS
            if (started + timedelta(days=offset)).date() <= LAST_STUDY_DAY.date()
        ]
        completed_count = len(due_checkpoints)
        next_stage = completed_count + 1
        next_offset = INTERVALS[next_stage - 1][0]
        next_due = study_day_start(started + timedelta(days=next_offset))
        last_review = (started + timedelta(days=due_checkpoints[-1][0])).replace(hour=19, minute=0) if due_checkpoints else None
        unit_retry_ids = {
            word_id for word_id in frequently_wrong_ids
            if words_by_id.get(word_id, {}).get("unitId") == unit_id and completed_count > 0
        }
        retry_stages = {completed_count}
        if completed_count >= 2:
            retry_stages.add(completed_count - 1)
        for group_index, group in enumerate(groups_by_unit[unit_id]):
            group_words = [words_by_id[word_id] for word_id in group["wordIds"] if word_id in words_by_id]
            session_completed = started.replace(hour=9, minute=0) + timedelta(minutes=group_index * 25)
            learning_sessions.append(learning_session(group, group_words, session_completed, difficulty_map))
            for stage, (offset_days, label) in enumerate(INTERVALS, start=1):
                if (started + timedelta(days=offset_days)).date() > LAST_STUDY_DAY.date():
                    break
                due = started + timedelta(days=offset_days)
                retry_words = unit_retry_ids if stage in retry_stages else set()
                test_records.append(formal_review(
                    group, group_words, due, stage, label, retry_words,
                    is_today=due.date() == LAST_STUDY_DAY.date(),
                ))
            schedules[group["id"]] = {
                "hasPassedFinalReview": False,
                "modelVersion": 9,
                "nextDueAt": ms(next_due),
                "reviewAnchorAt": ms(anchor),
                "stage": next_stage,
            }
            for word in group_words:
                is_recovery = word["id"] in unit_retry_ids
                recovery_due = study_day_start(last_review + timedelta(days=1)) if is_recovery and last_review else next_due
                current_stage = completed_count if is_recovery else next_stage
                word["mastery"] = mastery(
                    anchor, last_review, recovery_due, current_stage, completed_count,
                    needs_recovery=is_recovery,
                    recovery_target_stage=completed_count if is_recovery else None,
                )

    # The current screen opens the final Unit; all old activity and transient UI state are removed.
    data["learningSessions"] = sorted(learning_sessions, key=lambda item: item["completedAt"], reverse=True)
    data["tests"] = sorted(test_records, key=lambda item: item["completedAt"], reverse=True)
    data["relearningSessions"] = []
    data["pausedSessions"] = []
    data["activeSession"] = None
    data["groupReviewSchedules"] = schedules
    if test_records:
        latest = test_records[0]
        data["lastCompletion"] = {
            "type": "test",
            "recordId": latest["id"],
            "unitId": latest["unitId"],
            "groupId": latest["groupId"],
            "scopeLabel": latest["scopeLabel"],
            "completedAt": latest["completedAt"],
            "wordIds": latest["wordIds"],
            "responses": latest["responses"],
            "rounds": latest["rounds"],
        }
    else:
        data["lastCompletion"] = None
    data["createdAt"] = ms(unit_start[UNIT_IDS[0]])
    data["updatedAt"] = ms(LAST_STUDY_DAY)
    data["ui"] = {"selectedBookId": "ios-default-book", "selectedUnitId": "import-unit-9", "tab": "practice", "view": "home"}

    for unit in data.get("units", []):
        if unit.get("id") in unit_start:
            unit["createdAt"] = ms(unit_start[unit["id"]])

    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report = {
        "source": str(SOURCE),
        "output": str(OUTPUT),
        "timeline": {
            "initialStudy": {unit_id: unit_start[unit_id].date().isoformat() for unit_id in UNIT_IDS},
            "formalReviewDays": [label for _, label in INTERVALS],
            "finalCompletedReview": "Only checkpoints due by 2026-09-30",
        },
        "preservedErrorSignal": {
            "oneRecordedMiss_B": sum(1 for word_id, count in misses.items() if count == 1 and word_id not in recovery_ids),
            "repeatedMissOrRecovery_C": sum(1 for word in original_words if word.get("unitId") in UNIT_IDS and difficulty_for(word["id"], misses, recovery_ids) == "C"),
            "frequentlyWrongOrRecoveryRetained": sum(1 for word_id in frequently_wrong_ids if words_by_id.get(word_id, {}).get("unitId") in UNIT_IDS),
        },
        "newRecords": {"learningSessions": len(learning_sessions), "formalReviews": len(test_records), "relearningSessions": 0},
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(OUTPUT)
    print(REPORT)


if __name__ == "__main__":
    main()
