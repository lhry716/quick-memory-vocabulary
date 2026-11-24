import Foundation
import Combine

@MainActor
final class StudyStore: ObservableObject {
    private static let persistenceQueue = DispatchQueue(
        label: "com.lhry716.QuickMemory.persistence",
        qos: .utility
    )

    @Published private(set) var books: [StudyBook] = []
    @Published private(set) var units: [StudyUnit] = []
    @Published private(set) var words: [StudyWord] = []
    @Published private(set) var groups: [StudyGroup] = []
    @Published private(set) var tests: [TestRecord] = []
    @Published private(set) var backupDate: Date?
    @Published private(set) var activeSession: StudySession?
    @Published private(set) var pausedSession: StudySession?
    @Published private(set) var completion: CompletionSummary?
    @Published var selectedBookID: String?
    @Published var selectedUnitID: String?
    @Published var lastError: String?

    private var rawState: [String: Any] = [:]
    // These indexes keep SwiftUI redraws from repeatedly scanning and sorting
    // the entire backup. They are rebuilt whenever the persisted model is
    // hydrated; they are derived data and never written to the backup.
    private var wordsByID: [String: StudyWord] = [:]
    private var wordsByUnitID: [String: [StudyWord]] = [:]
    private var unitsByID: [String: StudyUnit] = [:]
    private var groupsByUnitID: [String: [StudyGroup]] = [:]
    private var groupNumberByWordID: [String: Int] = [:]
    private var masteryByWordID: [String: [String: Any]] = [:]
    private var searchTextByWordID: [String: (term: String, meaning: String)] = [:]
    private var testsByUnitID: [String: [TestRecord]] = [:]
    private var testCountByGroupID: [String: Int] = [:]
    private var strugglingWordsByUnitID: [String: [WordStruggleStat]] = [:]
    private var pendingActiveSessionPersistence: Task<Void, Never>?
    private var hasUnsupportedActiveSession = false
    private let taipeiCalendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Taipei") ?? .current
        return calendar
    }()

    private static var defaultStorageURL: URL {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let folder = support.appendingPathComponent("QuickMemory", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder.appendingPathComponent("backup.json")
    }
    private let storageURL: URL

    init(storageURL: URL? = nil) {
        self.storageURL = storageURL ?? Self.defaultStorageURL
        loadSavedBackup()
    }

    var hasBackup: Bool { !books.isEmpty && !units.isEmpty }
    var selectedBook: StudyBook? { books.first { $0.id == selectedBookID } ?? books.first }
    var selectedUnit: StudyUnit? { units.first { $0.id == selectedUnitID } ?? units.first }
    var exportedBackup: BackupDocument { BackupDocument(data: encodedBackup()) }
    var testsCount: Int { tests.count }

    func words(in unit: StudyUnit) -> [StudyWord] {
        wordsByUnitID[unit.id] ?? []
    }

    func units(in book: StudyBook) -> [StudyUnit] {
        units.filter { $0.bookID == book.id }
    }

    func groups(in unit: StudyUnit) -> [StudyGroup] {
        groupsByUnitID[unit.id] ?? []
    }

    func words(in group: StudyGroup) -> [StudyWord] {
        var seen = Set<String>()
        return group.wordIDs.compactMap { id in
            guard seen.insert(id).inserted,
                  let word = wordsByID[id],
                  word.unitID == group.unitID else { return nil }
            return word
        }
    }

    /// Searches the complete imported library, rather than only the currently
    /// selected Unit. Results retain their original Unit and study-group
    /// location so learners can immediately find the source card.
    func searchWords(matching query: String) -> [WordLibrarySearchResult] {
        let searchText = normalizedSearchText(query)
        guard !searchText.isEmpty else { return [] }

        func rank(_ word: StudyWord) -> Int {
            let indexedText = searchTextByWordID[word.id]?.term ?? normalizedSearchText(word.term)
            if indexedText == searchText { return 0 }
            if indexedText.contains(searchText) { return 1 }
            return 2
        }

        return words
            .lazy
            .filter {
                guard let indexedText = self.searchTextByWordID[$0.id] else { return false }
                return indexedText.term.contains(searchText) || indexedText.meaning.contains(searchText)
            }
            .compactMap { word in
                self.unitsByID[word.unitID].map {
                    WordLibrarySearchResult(word: word, unit: $0, groupNumber: self.groupNumberByWordID[word.id])
                }
            }
            .sorted {
                let leftRank = rank($0.word)
                let rightRank = rank($1.word)
                if leftRank != rightRank { return leftRank < rightRank }
                if $0.unit.name != $1.unit.name { return $0.unit.name.localizedCaseInsensitiveCompare($1.unit.name) == .orderedAscending }
                return $0.word.term.localizedCaseInsensitiveCompare($1.word.term) == .orderedAscending
            }
    }

    func learnedCount(in unit: StudyUnit) -> Int { words(in: unit).filter { $0.initialDifficulty != nil }.count }
    func stableCount(in unit: StudyUnit) -> Int { words(in: unit).filter { $0.masteryStage >= 7 }.count }
    func dueCount(in unit: StudyUnit) -> Int {
        groups(in: unit).reduce(0) { $0 + normalDueCount(in: $1) }
            + words(in: unit).filter { isRecoveryWord($0) && ($0.nextDueAt ?? .distantFuture) <= .now }.count
    }
    func dueCount(in group: StudyGroup) -> Int { normalDueCount(in: group) }
    func normalDueCount(in group: StudyGroup) -> Int { normalDueWords(in: group).count }

    /// A normal-review card identifies the precise formal checkpoint that is
    /// due, rather than only saying that some words are due today.
    func normalReviewDetail(in group: StudyGroup) -> String {
        guard let schedule = groupReviewSchedule(for: group) else { return "正式複習" }
        let stage = max(1, min(7, integer(schedule["stage"]) ?? 1))
        return "第 \(stage) 次 · D\(intervalDays(for: stage)) 複習"
    }

    /// Recovery is intentionally regrouped at twenty words per card.  Normal
    /// due reviews remain in their original study groups.
    func recoveryBatches(in unit: StudyUnit) -> [RecoveryReviewBatch] {
        let today = dayKey(.now)
        let completedIDs = Set(tests
            .filter {
                $0.unitID == unit.id
                    && $0.scopeLabel.hasPrefix("Recovery 第")
                    && $0.completedAt.map { dayKey($0) == today } == true
            }
            .flatMap(\.wordIDs))
        let pendingIDs = Set(words(in: unit)
            .filter { isRecoveryWord($0) && ($0.nextDueAt ?? .distantFuture) <= .now }
            .map(\.id))
        let selectedIDs = completedIDs.union(pendingIDs)
        let selectedWords = words(in: unit)
            .filter { selectedIDs.contains($0.id) }
            .sorted {
                $0.term.localizedCaseInsensitiveCompare($1.term) == .orderedAscending
            }

        return stride(from: 0, to: selectedWords.count, by: 20).enumerated().map { offset, start in
            let batchWords = Array(selectedWords[start..<min(start + 20, selectedWords.count)])
            return RecoveryReviewBatch(
                id: "recovery-\(unit.id)-\(today)-\(offset + 1)",
                unitID: unit.id,
                number: offset + 1,
                wordIDs: batchWords.map(\.id),
                recoveryCount: batchWords.filter { rawMastery(for: $0.id)?["needsRecovery"] as? Bool == true }.count,
                confirmationCount: batchWords.filter { rawMastery(for: $0.id)?["isRecoveryConfirmation"] as? Bool == true }.count
            )
        }
    }

    func dueCount(in batch: RecoveryReviewBatch) -> Int {
        batch.wordIDs.filter { id in
            guard let word = word(for: id) else { return false }
            return isRecoveryWord(word) && (word.nextDueAt ?? .distantFuture) <= .now
        }.count
    }

    func completedRecoveryReview(in batch: RecoveryReviewBatch) -> TestRecord? {
        let today = dayKey(.now)
        return tests
            .filter {
                $0.groupID == batch.id
                    && $0.scopeLabel.hasPrefix("Recovery 第")
                    && $0.completedAt.map { dayKey($0) == today } == true
            }
            .sorted { ($0.completedAt ?? .distantPast) > ($1.completedAt ?? .distantPast) }
            .first
    }
    func completedDueReview(in group: StudyGroup) -> TestRecord? {
        let today = dayKey(.now)
        return tests
            .filter {
                $0.groupID == group.id
                    && $0.scopeLabel.contains("今日到期複習")
                    && $0.completedAt.map { dayKey($0) == today } == true
            }
            .sorted { ($0.completedAt ?? .distantPast) > ($1.completedAt ?? .distantPast) }
            .first
    }
    func masteryProgress(in unit: StudyUnit) -> Double {
        let unitWords = words(in: unit)
        guard !unitWords.isEmpty else { return 0 }
        let totalScore = unitWords.reduce(0) { total, word in
            total + masteryScore(for: word, mastery: masteryByWordID[word.id])
        }
        return Double(totalScore) / Double(unitWords.count * 100)
    }

    func progress(in group: StudyGroup) -> (completed: Int, total: Int) {
        let groupWords = words(in: group)
        return (groupWords.filter { $0.initialDifficulty != nil }.count, groupWords.count)
    }

    func tests(in unit: StudyUnit) -> [TestRecord] { testsByUnitID[unit.id] ?? [] }

    func testCount(in group: StudyGroup) -> Int { testCountByGroupID[group.id, default: 0] }

    func strugglingWords(in unit: StudyUnit) -> [WordStruggleStat] {
        if let cachedWords = strugglingWordsByUnitID[unit.id] {
            return cachedWords
        }

        let calculatedWords = calculateStrugglingWords(in: unit)
        strugglingWordsByUnitID[unit.id] = calculatedWords
        return calculatedWords
    }

    private func calculateStrugglingWords(in unit: StudyUnit) -> [WordStruggleStat] {
        let wordsByID = Dictionary(uniqueKeysWithValues: words(in: unit).map { ($0.id, $0) })
        var totals: [String: (retryTestCount: Int, totalRetryRounds: Int, maxRound: Int)] = [:]
        var firstRoundSuccessStreak: [String: Int] = [:]
        var frequentlyWrongIDs = Set<String>()

        for record in tests(in: unit).reversed() {
            let responsesByWord = Dictionary(grouping: record.responses, by: \.wordID)
            for (wordID, responses) in responsesByWord {
                guard let firstRoundResponse = responses.first(where: { $0.round == 1 }) else { continue }
                if firstRoundResponse.known {
                    firstRoundSuccessStreak[wordID, default: 0] += 1
                    if firstRoundSuccessStreak[wordID] == 3 {
                        frequentlyWrongIDs.remove(wordID)
                    }
                } else {
                    firstRoundSuccessStreak[wordID] = 0
                }

                // A word that reaches round 3 in a single Test is immediately
                // treated as frequently wrong. Three later first-round successes
                // still clear the label through the branch above.
                guard let lastRound = responses.map(\.round).max(), lastRound > 1 else { continue }
                if lastRound >= 3 {
                    frequentlyWrongIDs.insert(wordID)
                }
                var total = totals[wordID] ?? (retryTestCount: 0, totalRetryRounds: 0, maxRound: 0)
                total.retryTestCount += 1
                total.totalRetryRounds += lastRound - 1
                total.maxRound = max(total.maxRound, lastRound)
                totals[wordID] = total
            }
        }

        return totals.compactMap { wordID, total in
            guard let word = wordsByID[wordID],
                  frequentlyWrongIDs.contains(wordID) else { return nil }
            return WordStruggleStat(
                word: word,
                retryTestCount: total.retryTestCount,
                totalRetryRounds: total.totalRetryRounds,
                maxRound: total.maxRound
            )
        }
        .sorted {
            $0.retryTestCount > $1.retryTestCount
            || ($0.retryTestCount == $1.retryTestCount && $0.maxRound > $1.maxRound)
            || ($0.retryTestCount == $1.retryTestCount && $0.maxRound == $1.maxRound && $0.word.term < $1.word.term)
        }
    }

    func strugglingCount(in group: StudyGroup) -> Int {
        strugglingWords(in: group).count
    }

    func strugglingWords(in group: StudyGroup) -> [WordStruggleStat] {
        let groupWordIDs = Set(words(in: group).map(\.id))
        return strugglingWords(in: StudyUnit(id: group.unitID, bookID: "", name: ""))
            .filter { groupWordIDs.contains($0.word.id) }
    }

    func importBackup(_ data: Data) {
        do {
            guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  object["units"] is [Any], object["words"] is [Any] else { throw ImportError.invalidBackup }
            rawState = object
            normalizeBooks()
            migrateMasteryModelV6()
            _ = materializeMissingStudyGroups()
            hydrate()
            _ = repairStalledRecoveryResults()
            _ = ensureGroupReviewSchedules()
            hydrate()
            try encodedBackup().write(to: storageURL, options: .atomic)
            backupDate = .now
            lastError = nil
        } catch {
            lastError = "無法讀取這份備份。請使用網站「資料管理 → 匯出 JSON」產生的檔案。"
        }
    }

    func start(group: StudyGroup, timeLimitSeconds: Int? = nil) {
        guard !hasUnsupportedActiveSession else {
            lastError = "這份備份有正在進行的重新初學。請先回網站完成或暫存它，避免手機覆寫這筆紀錄。"
            return
        }
        // A group may have both a regular Test and a due-review session.  Only
        // resume a regular session from the group entry; otherwise tapping
        // "Test 本組" could unexpectedly open the review queue.
        if let activeSession,
           activeSession.groupID == group.id,
           !isDueReviewSession(activeSession) { return }
        if let pausedSession,
           pausedSession.groupID == group.id,
           !isDueReviewSession(pausedSession) {
            resumePausedSession()
            return
        }

        let groupWords = words(in: group)
        guard !groupWords.isEmpty else {
            lastError = "第 \(group.number) 組找不到可用單字。請重新匯入網站匯出的 JSON 備份後再試。"
            return
        }
        if activeSession != nil { pauseActiveSession() }
        let groupWordIDs = groupWords.map(\.id)
        let remaining = groupWords.filter { $0.initialDifficulty == nil }
        if remaining.isEmpty {
            let wordIDs = shuffled(groupWordIDs)
            activeSession = StudySession(
                id: identifier(), kind: .test, unitID: group.unitID, groupID: group.id,
                wordIDs: groupWordIDs, queue: wordIDs, startedAt: .now,
                timeLimitSeconds: timeLimitSeconds,
                scopeLabel: "第 \(group.number) 組 Test", testNumber: tests.filter { $0.unitID == group.unitID }.count + 1
            )
        } else {
            let wordIDs = remaining.map(\.id)
            activeSession = StudySession(
                id: identifier(), kind: .learning, unitID: group.unitID, groupID: group.id,
                wordIDs: wordIDs, queue: shuffled(wordIDs), startedAt: .now,
                timeLimitSeconds: timeLimitSeconds,
                scopeLabel: "第 \(group.number) 組初學", testNumber: nil
            )
        }
        completion = nil
        persistActiveSession()
    }

    func startDueReview(in group: StudyGroup, timeLimitSeconds: Int? = nil) {
        guard !hasUnsupportedActiveSession else {
            lastError = "這份備份有正在進行的重新初學。請先回網站完成或暫存它，避免手機覆寫這筆紀錄。"
            return
        }

        if let activeSession,
           activeSession.groupID == group.id,
           activeSession.scopeLabel.contains("今日到期複習") { return }
        if let pausedSession,
           pausedSession.groupID == group.id,
           pausedSession.scopeLabel.contains("今日到期複習") {
            resumePausedSession()
            return
        }

        let candidates = normalDueWords(in: group)
        guard !candidates.isEmpty else {
            lastError = "這組今天沒有到期的複習字。"
            return
        }

        if activeSession != nil { pauseActiveSession() }
        let wordIDs = candidates.map(\.id)
        activeSession = StudySession(
            id: identifier(), kind: .test, unitID: group.unitID, groupID: group.id,
            wordIDs: wordIDs, queue: shuffled(wordIDs), startedAt: .now,
            timeLimitSeconds: timeLimitSeconds,
            scopeLabel: "第 \(group.number) 組今日到期複習", testNumber: nil
        )
        completion = nil
        persistActiveSession()
    }

    func startRecoveryReview(_ batch: RecoveryReviewBatch, timeLimitSeconds: Int? = nil) {
        guard !hasUnsupportedActiveSession else {
            lastError = "這份備份有正在進行的重新初學。請先回網站完成或暫存它，避免手機覆寫這筆紀錄。"
            return
        }
        if let activeSession, activeSession.groupID == batch.id,
           activeSession.scopeLabel.hasPrefix("Recovery 第") { return }
        if let pausedSession, pausedSession.groupID == batch.id,
           pausedSession.scopeLabel.hasPrefix("Recovery 第") {
            resumePausedSession()
            return
        }

        let candidateIDs = batch.wordIDs.filter { id in
            guard let word = word(for: id) else { return false }
            return isRecoveryWord(word) && (word.nextDueAt ?? .distantFuture) <= .now
        }
        guard !candidateIDs.isEmpty else {
            lastError = "這組 Recovery 今天沒有到期單字。"
            return
        }
        if activeSession != nil { pauseActiveSession() }
        activeSession = StudySession(
            id: identifier(), kind: .test, unitID: batch.unitID, groupID: batch.id,
            wordIDs: candidateIDs, queue: shuffled(candidateIDs), startedAt: .now,
            timeLimitSeconds: timeLimitSeconds,
            scopeLabel: "Recovery 第 \(batch.number) 組", testNumber: nil
        )
        completion = nil
        persistActiveSession()
    }

    func startRecoveryPractice(_ batch: RecoveryReviewBatch, wordIDs: [String], timeLimitSeconds: Int? = nil) {
        guard !hasUnsupportedActiveSession else {
            lastError = "這份備份有正在進行的重新初學。請先回網站完成或暫存它，避免手機覆寫這筆紀錄。"
            return
        }
        let validIDs = wordIDs.filter { batch.wordIDs.contains($0) && word(for: $0) != nil }
        guard !validIDs.isEmpty else {
            lastError = "找不到今天已完成的 Recovery 單字。"
            return
        }
        if activeSession != nil { pauseActiveSession() }
        activeSession = StudySession(
            id: identifier(), kind: .test, unitID: batch.unitID, groupID: batch.id,
            wordIDs: validIDs, queue: shuffled(validIDs), startedAt: .now,
            timeLimitSeconds: timeLimitSeconds,
            scopeLabel: "Recovery 第 \(batch.number) 組今日重看", testNumber: nil
        )
        completion = nil
        persistActiveSession()
    }

    func startReviewPractice(in group: StudyGroup, wordIDs: [String], timeLimitSeconds: Int? = nil) {
        guard !hasUnsupportedActiveSession else {
            lastError = "這份備份有正在進行的重新初學。請先回網站完成或暫存它，避免手機覆寫這筆紀錄。"
            return
        }

        if let activeSession,
           activeSession.groupID == group.id,
           activeSession.scopeLabel.contains("今日複習重看") { return }
        if let pausedSession,
           pausedSession.groupID == group.id,
           pausedSession.scopeLabel.contains("今日複習重看") {
            resumePausedSession()
            return
        }

        let validWordIDs = Set(words(in: group).map(\.id))
        let practiceIDs = wordIDs.filter { validWordIDs.contains($0) }
        guard !practiceIDs.isEmpty else {
            lastError = "找不到今天已完成的複習單字。"
            return
        }

        if activeSession != nil { pauseActiveSession() }
        activeSession = StudySession(
            id: identifier(), kind: .test, unitID: group.unitID, groupID: group.id,
            wordIDs: practiceIDs, queue: shuffled(practiceIDs), startedAt: .now,
            timeLimitSeconds: timeLimitSeconds,
            scopeLabel: "第 \(group.number) 組今日複習重看", testNumber: nil
        )
        completion = nil
        persistActiveSession()
    }

    private func isDueReviewSession(_ session: StudySession) -> Bool {
        session.scopeLabel.contains("今日到期複習")
    }

    /// A completed Recovery is a formal result; "今日重看" is practice only.
    /// Keeping them separate prevents a practice run from changing memory state
    /// when it crosses the 05:00 study-day boundary.
    private func isFormalRecoverySession(_ session: StudySession) -> Bool {
        session.scopeLabel.hasPrefix("Recovery 第") && !session.scopeLabel.contains("今日重看")
    }

    func resumePausedSession() {
        guard var pausedSession else { return }
        var paused = rawState["pausedSessions"] as? [[String: Any]] ?? []
        paused.removeAll { ($0["id"] as? String) == pausedSession.id }
        rawState["pausedSessions"] = paused
        pausedSession.resumeTimer()
        activeSession = pausedSession
        self.pausedSession = nil
        completion = nil
        persistActiveSession()
    }

    /// Ends a timed session using only the answers already submitted.
    /// Unseen cards are deliberately left unanswered and are not scored.
    /// A timeout is not a completion: no learning/test record is created and
    /// no formal review result is applied.
    func finishTimedOutSession() {
        guard let session = activeSession else { return }
        let answered = session.responses.filter { $0.round == 1 }
        let known = answered.filter(\.known).count
        let unknown = answered.filter { !$0.known }.count
        let detail = "本次只保存已作答內容；因為時間到時尚未完成，所以不算完成，也不會建立正式紀錄。"
        activeSession = nil
        rawState["activeSession"] = NSNull()
        completion = CompletionSummary(
            kind: session.kind,
            title: "時間到，尚未完成",
            detail: detail,
            knownCount: known,
            unknownCount: unknown,
            roundCount: max(1, session.round),
            timedOut: true
        )
        persist(refresh: true)
    }

    func toggleCard() { activeSession?.isFlipped.toggle(); persistActiveSession() }

    /// Reverts the current card back to the previous one after a mis-swipe.
    ///
    /// ⚠️ 限制：這只會復原「畫面位置」跟移除最後一筆 `StudyResponse`，
    /// 並不會反悔 `answer(isKnown:)` 當下可能已經寫入的永久紀錄
    /// （例如 Learning 模式建立的 `initialDifficulty`）。也就是說，如果
    /// 使用者是在「這一輪的最後一張」滑錯、導致進入下一輪或已經寫入難度，
    /// 復原鍵是沒辦法把那個副作用一起撤銷的——這種情況下 index 會停在 0，
    /// 下面的 guard 會直接擋掉，避免復原到錯誤或不存在的狀態。
    func undoLastAnswer() {
        guard var session = activeSession,
              session.index > 0,
              !session.responses.isEmpty else { return }
        session.responses.removeLast()
        session.index -= 1
        session.isFlipped = false
        activeSession = session
        persistActiveSession()
    }

    func answer(isKnown: Bool) {
        guard var session = activeSession, let wordID = session.currentWordID else { return }
        if let deadline = session.deadline, deadline <= .now {
            finishTimedOutSession()
            return
        }
        let response = StudyResponse(wordID: wordID, known: isKnown, round: session.round, answeredAt: .now)
        session.responses.append(response)

        if session.kind == .learning {
            if session.round == 1, isKnown { establishInitialDifficulty(wordID, difficulty: "A", responses: session.responses) }
            if session.round == 2, isKnown { establishInitialDifficulty(wordID, difficulty: "B", responses: session.responses) }
            if session.round == 3 { establishInitialDifficulty(wordID, difficulty: "C", responses: session.responses) }
        }

        if session.index < session.queue.count - 1 {
            session.index += 1
            session.isFlipped = false
            activeSession = session
            persistActiveSession()
            return
        }

        if session.kind == .learning {
            let unresolved = session.wordIDs.filter { word(for: $0)?.initialDifficulty == nil }
            if session.round < 3, !unresolved.isEmpty {
                session.queue = shuffled(unresolved)
                session.index = 0
                session.round += 1
                session.isFlipped = false
                activeSession = session
                persistActiveSession()
            } else {
                finishLearning(session)
            }
        } else {
            let roundResponses = session.responses.filter { $0.round == session.round }
            let incorrectIDs = session.queue.filter { id in roundResponses.last(where: { $0.wordID == id })?.known == false }
            session.rounds.removeAll { $0.round == session.round }
            session.rounds.append(TestRound(round: session.round, wordIDs: session.queue, known: roundResponses.filter(\.known).count, unknown: incorrectIDs.count))
            if !incorrectIDs.isEmpty {
                session.queue = shuffled(incorrectIDs)
                session.index = 0
                session.round += 1
                session.isFlipped = false
                activeSession = session
                persistActiveSession()
            } else {
                finishTest(session)
            }
        }
    }

    func pauseActiveSession() {
        guard var activeSession else { return }
        activeSession.pauseTimer()
        var paused = rawState["pausedSessions"] as? [[String: Any]] ?? []
        paused.removeAll { ($0["id"] as? String) == activeSession.id }
        paused.insert(sessionDictionary(activeSession), at: 0)
        rawState["pausedSessions"] = paused
        rawState["activeSession"] = NSNull()
        self.activeSession = nil
        self.pausedSession = activeSession
        persist(refresh: true)
    }

    /// A running timer is based on an absolute deadline, so it keeps counting
    /// while this view or the entire app is not visible. iOS may suspend the
    /// process in the background; checking on return gives the same result.
    func reconcileTimedSession() {
        guard let deadline = activeSession?.deadline, deadline <= .now else { return }
        finishTimedOutSession()
    }

    func dismissCompletion() { completion = nil }

    private func finishLearning(_ session: StudySession, timedOut: Bool = false) {
        let counts = difficultyCounts(session.wordIDs)
        let completedAt = Date()
        let record: [String: Any] = [
            "id": session.id, "unitId": session.unitID, "groupId": session.groupID,
            "batchNumber": groupNumber(for: session.groupID), "startedAt": milliseconds(session.startedAt),
            "completedAt": milliseconds(completedAt), "wordIds": session.wordIDs,
            "responses": responseDictionaries(session.responses), "counts": counts
        ]
        prepend(record, to: "learningSessions")
        rawState["lastCompletion"] = ["type": "learning", "unitId": session.unitID, "groupId": session.groupID, "completedAt": milliseconds(completedAt), "wordIds": session.wordIDs, "responses": responseDictionaries(session.responses), "counts": counts]
        activeSession = nil
        rawState["activeSession"] = NSNull()
        let activatedGroup = activateGroupReviewIfReady(groupID: session.groupID, activatedAt: completedAt)
        let detail = activatedGroup
            ? "這組 20 個字會在下一個早上 5 點一起進入 D1 複習。"
            : "A \(counts["A"] ?? 0) · B \(counts["B"] ?? 0) · C \(counts["C"] ?? 0)。"
        let title = timedOut ? "時間到，先到這裡" : "第 \(groupNumber(for: session.groupID)) 組初學完成"
        let timedDetail = "本次已保存 \(session.responses.count) 個作答；尚未看到的單字會留待下次。"
        completion = CompletionSummary(kind: .learning, title: title, detail: timedOut ? timedDetail : detail, knownCount: counts["A"] ?? 0, unknownCount: (counts["B"] ?? 0) + (counts["C"] ?? 0), roundCount: session.round, timedOut: timedOut)
        persist(refresh: true)
    }

    private func finishTest(_ session: StudySession, timedOut: Bool = false) {
        var session = session
        if timedOut, !session.responses.isEmpty {
            let currentRound = session.round
            let currentResponses = session.responses.filter { $0.round == currentRound }
            if !currentResponses.isEmpty {
                session.rounds.append(TestRound(round: currentRound, wordIDs: currentResponses.map(\.wordID), known: currentResponses.filter(\.known).count, unknown: currentResponses.filter { !$0.known }.count))
            }
        }
        if isDueReviewSession(session) {
            applyGroupFormalResults(session)
        } else if isFormalRecoverySession(session) {
            for wordID in session.wordIDs {
                guard let answer = session.responses.first(where: { $0.wordID == wordID && $0.round == 1 }) else { continue }
                applyTestResult(wordID, known: answer.known, testedAt: answer.answeredAt, allowsSameDayRecoveryUpdate: true)
            }
        }
        let completedAt = Date()
        let recordID = identifier()
        let group = groups.first(where: { $0.id == session.groupID })
        let isRecoverySession = session.scopeLabel.hasPrefix("Recovery 第")
        let record: [String: Any] = [
            "id": recordID, "unitId": session.unitID, "groupId": group?.id ?? (isRecoverySession ? session.groupID : NSNull()),
            "groupLabel": group.map { "第 \($0.number) 組" } ?? (isRecoverySession ? session.scopeLabel : "全部單字"), "scope": group == nil ? "unit" : "group",
            "scopeLabel": session.scopeLabel, "testNumber": session.testNumber ?? 1,
            "startedAt": milliseconds(session.startedAt), "completedAt": milliseconds(completedAt),
            "wordIds": session.wordIDs, "responses": responseDictionaries(session.responses),
            "rounds": roundDictionaries(session.rounds)
        ]
        prepend(record, to: "tests")
        rawState["lastCompletion"] = ["type": "test", "recordId": recordID, "unitId": session.unitID, "groupId": group?.id ?? NSNull(), "scopeLabel": session.scopeLabel, "completedAt": milliseconds(completedAt), "wordIds": session.wordIDs, "responses": responseDictionaries(session.responses), "rounds": roundDictionaries(session.rounds)]
        let firstRound = session.rounds.first(where: { $0.round == 1 }) ?? TestRound(round: 1, wordIDs: session.wordIDs, known: 0, unknown: 0)
        activeSession = nil
        rawState["activeSession"] = NSNull()
        let title = timedOut ? "時間到，先到這裡" : "Test 已完成"
        let detail = timedOut
            ? "本次已保存首輪答對 \(firstRound.known) 個、答錯 \(firstRound.unknown) 個；尚未作答的單字不會被判錯。"
            : "首輪答對 \(firstRound.known) 個、答錯 \(firstRound.unknown) 個；錯字已重測到全部答對。只有首輪會更新長期掌握。"
        completion = CompletionSummary(kind: .test, title: title, detail: detail, knownCount: firstRound.known, unknownCount: firstRound.unknown, roundCount: max(1, session.rounds.count), timedOut: timedOut)
        persist(refresh: true)
    }

    private func establishInitialDifficulty(_ wordID: String, difficulty: String, responses: [StudyResponse]) {
        updateRawWord(wordID) { word in
            word["initialDifficulty"] = difficulty
            let establishedAt = Date()
            word["initialLearning"] = ["completedAt": milliseconds(establishedAt), "rounds": responseDictionaries(responses.filter { $0.wordID == wordID })]
            word["mastery"] = initialMastery(difficulty: difficulty, establishedAt: establishedAt)
        }
        hydrateWordsOnly()
    }

    #if false
    // Superseded Unit-wide formal-review experiment. Groups
    // are only a practical way to split that Unit-wide review into batches.
    private func applyDueReviewResults(_ session: StudySession) {
        var latestAnswerAt = session.startedAt
        for wordID in session.wordIDs {
            guard let answer = session.responses.first(where: { $0.wordID == wordID && $0.round == 1 }) else { continue }
            latestAnswerAt = max(latestAnswerAt, answer.answeredAt)
            let mastery = rawMastery(for: wordID)
            if mastery?["needsRecovery"] as? Bool == true || mastery?["isRecoveryConfirmation"] as? Bool == true {
                applyUnitRecoveryResult(wordID, known: answer.known, testedAt: answer.answeredAt)
            } else {
                collectUnitFormalResult(wordID, known: answer.known, testedAt: answer.answeredAt)
            }
        }
        finishUnitFormalCycleIfReady(unitID: session.unitID, completedAt: latestAnswerAt)
        finishUnitRecoveryIfReady(unitID: session.unitID, completedAt: latestAnswerAt)
    }

    private func collectUnitFormalResult(_ wordID: String, known: Bool, testedAt: Date) {
        updateRawWord(wordID) { word in
            guard let difficulty = word["initialDifficulty"] as? String else { return }
            var mastery = word["mastery"] as? [String: Any] ?? initialMastery(difficulty: difficulty, establishedAt: testedAt)
            let stage = max(1, min(6, integer(mastery["stage"]) ?? 1))
            mastery["modelVersion"] = 7
            mastery["tests"] = (integer(mastery["tests"]) ?? 0) + 1
            mastery["lastTestAt"] = milliseconds(testedAt)
            mastery["lastTestCorrect"] = known
            mastery["lastScoredAt"] = milliseconds(testedAt)
            mastery["lastScoredDay"] = dayKey(testedAt)
            mastery["unitFormalPending"] = true
            mastery["unitFormalCorrect"] = known
            mastery["nextDueAt"] = NSNull()
            word["mastery"] = syncedMastery(mastery, stage: stage)
        }
    }

    private func finishUnitFormalCycleIfReady(unitID: String, completedAt: Date) {
        var rawWords = rawState["words"] as? [[String: Any]] ?? []
        let indexes = rawWords.indices.filter {
            rawWords[$0]["unitId"] as? String == unitID && rawWords[$0]["initialDifficulty"] as? String != nil
        }
        guard !indexes.isEmpty,
              indexes.allSatisfy({ (rawWords[$0]["mastery"] as? [String: Any])?["unitFormalPending"] as? Bool == true }) else { return }

        let stage = max(1, min(6, integer((rawWords[indexes[0]]["mastery"] as? [String: Any])?["stage"]) ?? 1))
        let failedIndexes = indexes.filter { (($0 < rawWords.count ? rawWords[$0]["mastery"] as? [String: Any] : nil)?["unitFormalCorrect"] as? Bool) == false }

        for index in indexes {
            var mastery = rawWords[index]["mastery"] as? [String: Any] ?? [:]
            mastery["unitFormalPending"] = false
            mastery["unitFormalCorrect"] = NSNull()
            if failedIndexes.contains(index) {
                mastery["needsRecovery"] = true
                mastery["isRecoveryConfirmation"] = false
                mastery["recoveryTargetStage"] = stage
                mastery["unitWaitingForRecovery"] = false
                mastery["unitRecoveryResolved"] = false
                if stage == 6 { mastery["hasPassedFinalReview"] = false }
                mastery["nextDueAt"] = milliseconds(nextStudyDayStart(after: completedAt, days: 1))
            } else {
                mastery["unitWaitingForRecovery"] = true
                mastery["unitRecoveryResolved"] = false
                mastery["nextDueAt"] = NSNull()
            }
            rawWords[index]["mastery"] = syncedMastery(mastery, stage: stage)
        }
        rawState["words"] = rawWords

        guard failedIndexes.isEmpty else { return }
        scheduleNextUnitFormalReview(unitID: unitID, fromStage: stage, completedAt: completedAt)
    }

    private func applyUnitRecoveryResult(_ wordID: String, known: Bool, testedAt: Date) {
        updateRawWord(wordID) { word in
            guard let difficulty = word["initialDifficulty"] as? String else { return }
            var mastery = word["mastery"] as? [String: Any] ?? initialMastery(difficulty: difficulty, establishedAt: testedAt)
            let stage = max(1, min(6, integer(mastery["stage"]) ?? 1))
            let targetStage = max(1, min(6, integer(mastery["recoveryTargetStage"]) ?? stage))
            mastery["modelVersion"] = 7
            mastery["tests"] = (integer(mastery["tests"]) ?? 0) + 1
            mastery["lastTestAt"] = milliseconds(testedAt)
            mastery["lastTestCorrect"] = known
            mastery["lastScoredAt"] = milliseconds(testedAt)
            mastery["lastScoredDay"] = dayKey(testedAt)

            if !known {
                mastery["needsRecovery"] = true
                mastery["isRecoveryConfirmation"] = false
                mastery["nextDueAt"] = milliseconds(nextStudyDayStart(after: testedAt, days: 1))
            } else if mastery["needsRecovery"] as? Bool == true {
                let confirmationStage = max(1, targetStage - 1)
                mastery["needsRecovery"] = false
                mastery["isRecoveryConfirmation"] = true
                mastery["nextDueAt"] = milliseconds(nextStudyDayStart(after: testedAt, days: intervalDays(for: confirmationStage)))
            } else {
                // The recovery word has proven the preceding level.  It waits
                // for any other recovery words before the whole Unit resumes.
                mastery["isRecoveryConfirmation"] = false
                mastery["unitRecoveryResolved"] = true
                mastery["nextDueAt"] = NSNull()
            }
            word["mastery"] = syncedMastery(mastery, stage: stage)
        }
    }

    private func finishUnitRecoveryIfReady(unitID: String, completedAt: Date) {
        let rawWords = rawState["words"] as? [[String: Any]] ?? []
        let unitWords = rawWords.filter {
            $0["unitId"] as? String == unitID && $0["initialDifficulty"] as? String != nil
        }
        guard !unitWords.isEmpty else { return }
        let recoveriesExist = unitWords.contains {
            let mastery = $0["mastery"] as? [String: Any] ?? [:]
            return mastery["unitWaitingForRecovery"] as? Bool == true || mastery["unitRecoveryResolved"] as? Bool == true
        }
        guard recoveriesExist,
              !unitWords.contains(where: {
                  let mastery = $0["mastery"] as? [String: Any] ?? [:]
                  return mastery["needsRecovery"] as? Bool == true || mastery["isRecoveryConfirmation"] as? Bool == true
              }) else { return }
        let restoredStage = unitWords.compactMap {
            integer(($0["mastery"] as? [String: Any])?["recoveryTargetStage"])
        }.max() ?? 1
        scheduleUnitReview(unitID: unitID, stage: restoredStage, dueAt: nextStudyDayStart(after: completedAt, days: intervalDays(for: restoredStage)), hasPassedFinalReview: false)
    }

    private func scheduleNextUnitFormalReview(unitID: String, fromStage stage: Int, completedAt: Date) {
        if stage == 6 {
            scheduleUnitReview(unitID: unitID, stage: 6, dueAt: nextStudyDayStart(after: completedAt, days: intervalDays(for: 6)), hasPassedFinalReview: true)
            return
        }
        let nextStage = min(6, stage + 1)
        let rawWord = (rawState["words"] as? [[String: Any]] ?? []).first { $0["unitId"] as? String == unitID }
        let dueAt = rawWord.map { nextNormalDueDate(word: $0, nextStage: nextStage, testedAt: completedAt) }
            ?? nextStudyDayStart(after: completedAt, days: 1)
        scheduleUnitReview(unitID: unitID, stage: nextStage, dueAt: dueAt, hasPassedFinalReview: false)
    }

    private func scheduleUnitReview(unitID: String, stage: Int, dueAt: Date, hasPassedFinalReview: Bool) {
        var rawWords = rawState["words"] as? [[String: Any]] ?? []
        for index in rawWords.indices where rawWords[index]["unitId"] as? String == unitID {
            guard rawWords[index]["initialDifficulty"] as? String != nil else { continue }
            var mastery = rawWords[index]["mastery"] as? [String: Any] ?? [:]
            mastery["modelVersion"] = 6
            mastery["stage"] = stage
            mastery["qualifiedCount"] = max(integer(mastery["qualifiedCount"]) ?? 0, stage - 1)
            mastery["needsRecovery"] = false
            mastery["isRecoveryConfirmation"] = false
            mastery["recoveryTargetStage"] = NSNull()
            mastery["unitFormalPending"] = false
            mastery["unitFormalCorrect"] = NSNull()
            mastery["unitWaitingForRecovery"] = false
            mastery["unitRecoveryResolved"] = false
            mastery["hasPassedFinalReview"] = hasPassedFinalReview
            mastery["nextDueAt"] = milliseconds(dueAt)
            rawWords[index]["mastery"] = syncedMastery(mastery, stage: stage)
        }
        rawState["words"] = rawWords
    }

    private func rawMastery(for wordID: String) -> [String: Any]? {
        (rawState["words"] as? [[String: Any]] ?? []).first(where: { $0["id"] as? String == wordID })?["mastery"] as? [String: Any]
    }

    #endif

    private func rawMastery(for wordID: String) -> [String: Any]? {
        masteryByWordID[wordID]
    }

    private func isRecoveryWord(_ word: StudyWord) -> Bool {
        let mastery = rawMastery(for: word.id)
        return mastery?["needsRecovery"] as? Bool == true
            || mastery?["isRecoveryConfirmation"] as? Bool == true
    }

    private func groupReviewSchedule(for group: StudyGroup) -> [String: Any]? {
        (rawState["groupReviewSchedules"] as? [String: [String: Any]])?[group.id]
    }

    private func groupReviewIsDue(_ group: StudyGroup) -> Bool {
        guard let schedule = groupReviewSchedule(for: group),
              let dueAt = date(milliseconds: schedule["nextDueAt"]) else { return false }
        return dueAt <= .now
    }

    private func normalDueWords(in group: StudyGroup) -> [StudyWord] {
        guard groupReviewIsDue(group) else { return [] }
        return words(in: group)
            .filter { $0.initialDifficulty != nil && !isRecoveryWord($0) }
    }

    private func applyGroupFormalResults(_ session: StudySession) {
        guard let group = groups.first(where: { $0.id == session.groupID }),
              var schedule = groupReviewSchedule(for: group) else { return }
        let stage = max(1, min(7, integer(schedule["stage"]) ?? 1))
        let completedAt = session.responses.map(\.answeredAt).max() ?? .now
        let next = nextGroupMilestone(schedule: schedule, after: completedAt)

        for wordID in session.wordIDs {
            guard let firstAnswer = session.responses.first(where: { $0.wordID == wordID && $0.round == 1 }) else { continue }
            updateRawWord(wordID) { word in
                guard let difficulty = word["initialDifficulty"] as? String else { return }
                var mastery = word["mastery"] as? [String: Any] ?? initialMastery(difficulty: difficulty, establishedAt: completedAt)
                mastery["modelVersion"] = 7
                mastery["tests"] = (integer(mastery["tests"]) ?? 0) + 1
                mastery["lastTestAt"] = milliseconds(firstAnswer.answeredAt)
                mastery["lastTestCorrect"] = firstAnswer.known
                mastery["lastScoredAt"] = milliseconds(firstAnswer.answeredAt)
                // A session may be paused across the 05:00 study-day boundary.
                // The duplicate-score guard must track this word's actual first
                // answer, not when another word eventually finished the session.
                mastery["lastScoredDay"] = dayKey(firstAnswer.answeredAt)
                if firstAnswer.known {
                    mastery["stage"] = next.stage
                    mastery["qualifiedCount"] = max(integer(mastery["qualifiedCount"]) ?? 0, next.stage - 1)
                    mastery["needsRecovery"] = false
                    mastery["isRecoveryConfirmation"] = false
                    mastery["recoveryTargetStage"] = NSNull()
                    mastery["hasPassedFinalReview"] = stage == 7
                    mastery["nextDueAt"] = milliseconds(next.dueAt)
                    word["mastery"] = syncedMastery(mastery, stage: next.stage)
                } else {
                    mastery["stage"] = stage
                    mastery["needsRecovery"] = true
                    mastery["isRecoveryConfirmation"] = false
                    mastery["recoveryTargetStage"] = stage
                    mastery["hasPassedFinalReview"] = false
                    mastery["nextDueAt"] = milliseconds(nextStudyDayStart(after: firstAnswer.answeredAt, days: 1))
                    word["mastery"] = syncedMastery(mastery, stage: stage)
                }
            }
        }
        schedule["modelVersion"] = 8
        schedule["stage"] = next.stage
        schedule["nextDueAt"] = milliseconds(next.dueAt)
        schedule["hasPassedFinalReview"] = stage == 7
        updateGroupReviewSchedule(schedule, for: group.id)
    }

    private func applyTestResult(
        _ wordID: String,
        known: Bool,
        testedAt: Date,
        allowsSameDayRecoveryUpdate: Bool = false,
        recordsTestAttempt: Bool = true
    ) {
        updateRawWord(wordID) { word in
            guard let difficulty = word["initialDifficulty"] as? String else { return }
            var mastery = word["mastery"] as? [String: Any] ?? initialMastery(difficulty: difficulty, establishedAt: testedAt)
            let today = dayKey(testedAt)
            let stage = max(1, min(7, integer(mastery["stage"]) ?? 1))
            mastery["modelVersion"] = 7
            if recordsTestAttempt {
                mastery["tests"] = (integer(mastery["tests"]) ?? 0) + 1
                mastery["lastTestAt"] = milliseconds(testedAt)
                mastery["lastTestCorrect"] = known
            }
            let isDueRecovery = mastery["needsRecovery"] as? Bool == true
                || mastery["isRecoveryConfirmation"] as? Bool == true
            if mastery["lastScoredDay"] as? String == today
                && !(allowsSameDayRecoveryUpdate && isDueRecovery) {
                word["mastery"] = syncedMastery(mastery, stage: stage)
                return
            }

            // Only a test at its due date is a formal retention result. An
            // early group/random test stays in the history as practice only.
            let dueDate = date(milliseconds: mastery["nextDueAt"])
            guard dueDate.map({ dayKey($0) <= today }) ?? false else {
                word["mastery"] = syncedMastery(mastery, stage: stage)
                return
            }

            if !known {
                mastery["needsRecovery"] = true
                mastery["isRecoveryConfirmation"] = false
                mastery["recoveryTargetStage"] = stage
                if stage == 7 { mastery["hasPassedFinalReview"] = false }
                mastery["lastScoredAt"] = milliseconds(testedAt)
                mastery["lastScoredDay"] = today
                mastery["nextDueAt"] = milliseconds(nextStudyDayStart(after: testedAt, days: 1))
                word["mastery"] = syncedMastery(mastery, stage: stage)
                return
            }

            mastery["lastScoredAt"] = milliseconds(testedAt)
            mastery["lastScoredDay"] = today
            if mastery["needsRecovery"] as? Bool == true {
                // Recovery success goes back one level for a separate proof;
                // it never restores the missed interval immediately.
                let confirmationStage = max(1, stage - 1)
                mastery["needsRecovery"] = false
                mastery["stage"] = confirmationStage
                mastery["isRecoveryConfirmation"] = true
                mastery["nextDueAt"] = milliseconds(nextStudyDayStart(after: testedAt, days: intervalDays(for: confirmationStage)))
                word["mastery"] = syncedMastery(mastery, stage: confirmationStage)
                return
            }

            if mastery["isRecoveryConfirmation"] as? Bool == true {
                // The preceding level is proven again; rejoin the original
                // group's next formal checkpoint, never a private word track.
                let restoredStage = max(1, min(7, integer(mastery["recoveryTargetStage"]) ?? stage))
                let rejoin = rejoinOriginalGroup(wordID: wordID, fallback: word, after: testedAt)
                mastery["stage"] = rejoin.stage
                mastery["isRecoveryConfirmation"] = false
                mastery["recoveryTargetStage"] = NSNull()
                mastery["qualifiedCount"] = max(integer(mastery["qualifiedCount"]) ?? 0, restoredStage - 1)
                mastery["nextDueAt"] = milliseconds(rejoin.dueAt)
                word["mastery"] = syncedMastery(mastery, stage: rejoin.stage)
                return
            }

            if stage == 7 {
                mastery["hasPassedFinalReview"] = true
                mastery["qualifiedCount"] = max(integer(mastery["qualifiedCount"]) ?? 0, 6)
                mastery["nextDueAt"] = milliseconds(rejoinOriginalGroup(wordID: wordID, fallback: word, after: testedAt).dueAt)
                word["mastery"] = syncedMastery(mastery, stage: stage)
                return
            }

            let nextStage = min(7, stage + 1)
            mastery["stage"] = nextStage
            mastery["qualifiedCount"] = max(integer(mastery["qualifiedCount"]) ?? 0, nextStage - 1)
            mastery["nextDueAt"] = milliseconds(nextNormalDueDate(word: word, nextStage: nextStage, testedAt: testedAt))
            word["mastery"] = syncedMastery(mastery, stage: nextStage)
        }
    }

    /// Repairs backups written by the older cross-study-day path. In that
    /// state a formal Recovery response was saved as correct, but its score was
    /// skipped because the preceding review had stamped `lastScoredDay` with
    /// the session-completion day. Replaying only that saved formal response
    /// updates mastery without adding another test attempt.
    @discardableResult
    private func repairStalledRecoveryResults() -> Bool {
        var latestFormalAnswer: [String: StudyResponse] = [:]
        for record in tests where record.scopeLabel.hasPrefix("Recovery 第") && !record.scopeLabel.contains("今日重看") {
            for response in record.responses where response.round == 1 {
                guard response.known else { continue }
                if latestFormalAnswer[response.wordID]?.answeredAt ?? .distantPast < response.answeredAt {
                    latestFormalAnswer[response.wordID] = response
                }
            }
        }

        var didRepair = false
        for (wordID, response) in latestFormalAnswer {
            guard let mastery = rawMastery(for: wordID),
                  mastery["needsRecovery"] as? Bool == true || mastery["isRecoveryConfirmation"] as? Bool == true,
                  mastery["lastTestCorrect"] as? Bool == true,
                  let lastTestAt = date(milliseconds: mastery["lastTestAt"]),
                  let lastScoredAt = date(milliseconds: mastery["lastScoredAt"]),
                  lastTestAt == response.answeredAt,
                  lastScoredAt < response.answeredAt else { continue }

            applyTestResult(
                wordID,
                known: true,
                testedAt: response.answeredAt,
                allowsSameDayRecoveryUpdate: true,
                recordsTestAttempt: false
            )
            didRepair = true
        }
        return didRepair
    }

    private func initialMastery(difficulty: String, establishedAt: Date) -> [String: Any] {
        ["modelVersion": 7, "stage": 1, "tests": 0, "qualifiedCount": 0, "lastScoredAt": NSNull(), "lastScoredDay": NSNull(), "lastTestAt": NSNull(), "lastTestCorrect": NSNull(), "needsRecovery": false, "isRecoveryConfirmation": false, "recoveryTargetStage": NSNull(), "hasPassedFinalReview": false, "reviewAnchorAt": NSNull(), "status": "已初學", "nextDueAt": NSNull()]
    }

    private func syncedMastery(_ mastery: [String: Any], stage: Int) -> [String: Any] {
        var result = mastery
        if result["needsRecovery"] as? Bool == true { result["status"] = "需加強" }
        else if result["isRecoveryConfirmation"] as? Bool == true { result["status"] = "確認中" }
        else if stage == 1 { result["status"] = "已初學" }
        else if stage <= 4 { result["status"] = "學習中" }
        else if stage <= 6 { result["status"] = "熟悉" }
        else { result["status"] = "穩定" }
        return result
    }

    // Formal review intervals: D1, D3, D7, D14, D30, then every 30 days.
    // Keep the seven internal stages for backwards-compatible recovery data;
    // stages after the fifth one use the final 30-day interval.
    private func intervalDays(for stage: Int) -> Int { [1, 3, 7, 14, 30, 30, 30][max(1, min(7, stage)) - 1] }

    private func updateGroupReviewSchedule(_ schedule: [String: Any], for groupID: String) {
        var schedules = rawState["groupReviewSchedules"] as? [String: [String: Any]] ?? [:]
        schedules[groupID] = schedule
        rawState["groupReviewSchedules"] = schedules
    }

    // Each original 20-word group owns one formal sequence. Recovery words
    // leave it temporarily; the next interval begins only after this group
    // actually completes its current formal review.
    private func nextGroupMilestone(schedule: [String: Any], after completedAt: Date) -> (stage: Int, dueAt: Date) {
        let currentStage = max(1, min(7, integer(schedule["stage"]) ?? 1))
        let nextStage = min(7, currentStage + 1)
        let gapDays = [1, 3, 7, 14, 30, 30, 30][currentStage - 1]
        return (nextStage, nextStudyDayStart(after: completedAt, days: gapDays))
    }

    private func rejoinOriginalGroup(wordID: String, fallback word: [String: Any], after testedAt: Date) -> (stage: Int, dueAt: Date) {
        guard let group = groups.first(where: { $0.wordIDs.contains(wordID) }),
              let schedule = groupReviewSchedule(for: group),
              let dueAt = date(milliseconds: schedule["nextDueAt"]) else {
            return nextSharedUnitMilestone(word: word, after: testedAt)
        }
        let stage = max(1, min(7, integer(schedule["stage"]) ?? 1))
        return (stage, dueAt)
    }

    private func nextNormalDueDate(word: [String: Any], nextStage: Int, testedAt: Date) -> Date {
        let establishedAt = date(milliseconds: (word["mastery"] as? [String: Any])?["reviewAnchorAt"])
            ?? date(milliseconds: (word["initialLearning"] as? [String: Any])?["completedAt"])
            ?? testedAt
        let targetDate = nextStudyDayStart(after: establishedAt, days: intervalDays(for: nextStage))
        return dayKey(targetDate) > dayKey(testedAt) ? targetDate : nextSharedUnitMilestone(word: word, after: testedAt).dueAt
    }

    // Regular reviews for a Unit share one calendar: D1, D3, D7, D14, D30,
    // then every 30 days. A recovered word joins this calendar at
    // its next future milestone instead of starting a private interval.
    private func nextSharedUnitMilestone(word: [String: Any], after afterDate: Date) -> (stage: Int, dueAt: Date) {
        let anchor = date(milliseconds: (word["mastery"] as? [String: Any])?["reviewAnchorAt"])
            ?? date(milliseconds: (word["initialLearning"] as? [String: Any])?["completedAt"])
            ?? afterDate
        for stage in 1...7 {
            let dueAt = nextStudyDayStart(after: anchor, days: intervalDays(for: stage))
            if dayKey(dueAt) > dayKey(afterDate) { return (stage, dueAt) }
        }
        var dueAt = nextStudyDayStart(after: anchor, days: intervalDays(for: 7))
        repeat { dueAt = nextStudyDayStart(after: dueAt, days: intervalDays(for: 7)) }
        while dayKey(dueAt) <= dayKey(afterDate)
        return (7, dueAt)
    }

    private func masteryScore(for word: StudyWord, mastery: [String: Any]?) -> Int {
        guard word.initialDifficulty != nil else { return 0 }
        guard let mastery else { return 10 }
        let stage = max(1, min(7, integer(mastery["stage"]) ?? 1))
        let recoveryTarget = max(1, min(7, integer(mastery["recoveryTargetStage"]) ?? stage))
        if mastery["needsRecovery"] as? Bool == true || mastery["isRecoveryConfirmation"] as? Bool == true {
            return score(afterEnteringStage: recoveryTarget)
        }
        if mastery["hasPassedFinalReview"] as? Bool == true { return 100 }
        return score(afterEnteringStage: stage)
    }

    private func score(afterEnteringStage stage: Int) -> Int {
        [10, 20, 30, 45, 60, 75, 90][max(1, min(7, stage)) - 1]
    }

    private func hydrate() {
        books = (rawState["books"] as? [[String: Any]] ?? []).compactMap { item in
            guard let id = item["id"] as? String else { return nil }
            return StudyBook(id: id, name: item["name"] as? String ?? "未命名書籍")
        }
        units = (rawState["units"] as? [[String: Any]] ?? []).compactMap { item in
            guard let id = item["id"] as? String, let bookID = item["bookId"] as? String else { return nil }
            return StudyUnit(id: id, bookID: bookID, name: item["name"] as? String ?? "未命名 Unit")
        }
        rebuildUnitIndex()
        hydrateWordsOnly()
        groups = parseGroups()
        rebuildGroupIndex()
        tests = (rawState["tests"] as? [[String: Any]] ?? []).compactMap(parseTest)
        rebuildTestIndexes()
        let rawActive = rawState["activeSession"] as? [String: Any]
        activeSession = rawActive.flatMap { parseSession($0) }
        hasUnsupportedActiveSession = rawActive != nil && activeSession == nil
        pausedSession = (rawState["pausedSessions"] as? [[String: Any]] ?? []).compactMap { parseSession($0, isPaused: true) }.first
        selectedBookID = books.contains(where: { $0.id == selectedBookID }) ? selectedBookID : books.first?.id
        selectedUnitID = selectedUnitID ?? units.first?.id
    }

    private func hydrateWordsOnly() {
        words = (rawState["words"] as? [[String: Any]] ?? []).compactMap { item in
            guard let id = item["id"] as? String, let unitID = item["unitId"] as? String else { return nil }
            let mastery = item["mastery"] as? [String: Any] ?? [:]
            let status = mastery["status"] as? String
            let stage = integer(mastery["stage"]) ?? (status == "穩定" ? 6 : status == "熟悉" ? 4 : status == "學習中" ? 2 : item["initialDifficulty"] == nil ? 0 : 1)
            return StudyWord(id: id, unitID: unitID, term: item["term"] as? String ?? "", meaning: item["meaning"] as? String ?? "", initialDifficulty: item["initialDifficulty"] as? String, masteryStage: stage, nextDueAt: date(milliseconds: mastery["nextDueAt"]))
        }
        rebuildWordIndexes()
    }

    private func rebuildWordIndexes() {
        var indexedWords: [String: StudyWord] = [:]
        var indexedUnits: [String: [StudyWord]] = [:]
        for word in words {
            indexedWords[word.id] = word
            indexedUnits[word.unitID, default: []].append(word)
        }
        wordsByID = indexedWords
        wordsByUnitID = indexedUnits.mapValues {
            $0.sorted { $0.term.localizedCaseInsensitiveCompare($1.term) == .orderedAscending }
        }

        var indexedMastery: [String: [String: Any]] = [:]
        var indexedSearchText: [String: (term: String, meaning: String)] = [:]
        for item in rawState["words"] as? [[String: Any]] ?? [] {
            guard let id = item["id"] as? String else { continue }
            if let mastery = item["mastery"] as? [String: Any] {
                indexedMastery[id] = mastery
            }
            indexedSearchText[id] = (
                term: normalizedSearchText(item["term"] as? String ?? ""),
                meaning: normalizedSearchText(item["meaning"] as? String ?? "")
            )
        }
        masteryByWordID = indexedMastery
        searchTextByWordID = indexedSearchText
    }

    private func rebuildUnitIndex() {
        var indexedUnits: [String: StudyUnit] = [:]
        for unit in units {
            indexedUnits[unit.id] = unit
        }
        unitsByID = indexedUnits
    }

    private func rebuildGroupIndex() {
        groupsByUnitID = Dictionary(grouping: groups, by: \.unitID).mapValues {
            $0.sorted { $0.number < $1.number }
        }
        var locations: [String: Int] = [:]
        for group in groups {
            for wordID in group.wordIDs where wordsByID[wordID]?.unitID == group.unitID {
                if let existingNumber = locations[wordID] {
                    locations[wordID] = min(existingNumber, group.number)
                } else {
                    locations[wordID] = group.number
                }
            }
        }
        groupNumberByWordID = locations
    }

    private func rebuildTestIndexes() {
        testsByUnitID = Dictionary(grouping: tests, by: \.unitID).mapValues {
            $0.sorted { ($0.completedAt ?? .distantPast) > ($1.completedAt ?? .distantPast) }
        }
        testCountByGroupID = tests.reduce(into: [:]) { counts, test in
            guard let groupID = test.groupID else { return }
            counts[groupID, default: 0] += 1
        }
        // This is derived display data. Calculate it only if the user opens a
        // unit that needs it, rather than delaying the initial app launch.
        strugglingWordsByUnitID = [:]
    }

    private func parseGroups() -> [StudyGroup] {
        let stored = rawState["studyGroups"] as? [[String: Any]] ?? []
        let storedGroups = stored.compactMap { item -> StudyGroup? in
            guard let id = item["id"] as? String, let unitID = item["unitId"] as? String else { return nil }
            return StudyGroup(id: id, unitID: unitID, number: integer(item["groupNumber"]) ?? 0, wordIDs: item["wordIds"] as? [String] ?? [])
        }

        // Backups can contain groups for only some units.  Keep every stored
        // group intact, but provide deterministic 20-word groups for each
        // unit whose group data is missing rather than requiring the whole
        // backup to have no groups at all.
        return units.flatMap { unit in
            let groupsForUnit = storedGroups.filter { $0.unitID == unit.id }
            guard groupsForUnit.isEmpty else { return groupsForUnit }
            // This fallback also follows the raw import order.  Normal imports
            // are materialized below, so this is only a safe compatibility
            // path for a legacy backup while it is being opened.
            let ids = (rawState["words"] as? [[String: Any]] ?? []).compactMap { word -> String? in
                guard word["unitId"] as? String == unit.id else { return nil }
                return word["id"] as? String
            }
            return stride(from: 0, to: ids.count, by: 20).enumerated().map { offset, start in StudyGroup(id: "generated-\(unit.id)-\(offset + 1)", unitID: unit.id, number: offset + 1, wordIDs: Array(ids[start..<min(start + 20, ids.count)])) }
        }
    }

    private func parseTest(_ item: [String: Any]) -> TestRecord? {
        guard let id = item["id"] as? String, let unitID = item["unitId"] as? String else { return nil }
        return TestRecord(id: id, unitID: unitID, groupID: item["groupId"] as? String, groupLabel: item["groupLabel"] as? String, scopeLabel: item["scopeLabel"] as? String ?? "Test", testNumber: integer(item["testNumber"]), completedAt: date(milliseconds: item["completedAt"]), wordIDs: item["wordIds"] as? [String] ?? [], responses: parseResponses(item["responses"]), rounds: parseRounds(item["rounds"]))
    }

    private func parseSession(_ item: [String: Any], isPaused: Bool = false) -> StudySession? {
        guard let id = item["id"] as? String, let type = item["type"] as? String, let kind = StudySessionKind(rawValue: type), let unitID = item["unitId"] as? String else { return nil }
        let wordIDs = (item["wordIds"] as? [String]) ?? (item["batchWordIds"] as? [String]) ?? (item["queue"] as? [String]) ?? []
        let queue = item["queue"] as? [String] ?? wordIDs
        guard let groupID = item["groupId"] as? String, !queue.isEmpty else { return nil }
        var session = StudySession(id: id, kind: kind, unitID: unitID, groupID: groupID, wordIDs: wordIDs, queue: queue, index: integer(item["index"]) ?? 0, round: integer(item["round"]) ?? 1, isFlipped: item["flipped"] as? Bool ?? false, responses: parseResponses(item["responses"]), rounds: parseRounds(item["rounds"]), startedAt: date(milliseconds: item["startedAt"]) ?? .now, timeLimitSeconds: integer(item["timeLimitSeconds"]), scopeLabel: item["scopeLabel"] as? String ?? "練習", testNumber: integer(item["testNumber"]), timerDeadline: date(milliseconds: item["timerDeadline"]), timerIsPaused: item["timerIsPaused"] as? Bool ?? false, pausedRemainingTimeSeconds: integer(item["pausedRemainingTimeSeconds"]))
        // Backwards compatibility: paused sessions saved before this change
        // did not record remaining time. Freeze them as soon as they load.
        if isPaused && !session.timerIsPaused { session.pauseTimer() }
        return session
    }

    private func parseResponses(_ raw: Any?) -> [StudyResponse] {
        (raw as? [[String: Any]] ?? []).compactMap { item in
            guard let wordID = item["wordId"] as? String, let known = item["known"] as? Bool else { return nil }
            return StudyResponse(wordID: wordID, known: known, round: integer(item["round"]) ?? 1, answeredAt: date(milliseconds: item["at"]) ?? .now)
        }
    }

    private func parseRounds(_ raw: Any?) -> [TestRound] {
        (raw as? [[String: Any]] ?? []).compactMap { item in
            guard let round = integer(item["round"]) else { return nil }
            return TestRound(round: round, wordIDs: item["wordIds"] as? [String] ?? [], known: integer(item["known"]) ?? 0, unknown: integer(item["unknown"]) ?? 0)
        }
    }

    private func persistActiveSession() {
        rawState["activeSession"] = activeSession.map(sessionDictionary) ?? NSNull()
        scheduleActiveSessionPersistence()
    }

    /// Coalesce rapid card flips into one background save.  Completed records
    /// still use `persist` immediately, and `flushPersistence` writes the
    /// latest snapshot before the app moves to the background.
    private func scheduleActiveSessionPersistence() {
        pendingActiveSessionPersistence?.cancel()
        let snapshot = rawState
        let destination = storageURL
        pendingActiveSessionPersistence = Task { @MainActor [weak self] in
            do {
                try await Task.sleep(nanoseconds: 350_000_000)
            } catch {
                return
            }
            guard !Task.isCancelled else { return }
            self?.enqueuePersistence(snapshot: snapshot, destination: destination)
        }
    }

    private func sessionDictionary(_ session: StudySession) -> [String: Any] {
        var result: [String: Any] = ["id": session.id, "type": session.kind.rawValue, "unitId": session.unitID, "groupId": session.groupID, "queue": session.queue, "wordIds": session.wordIDs, "batchWordIds": session.wordIDs, "index": session.index, "round": session.round, "flipped": session.isFlipped, "responses": responseDictionaries(session.responses), "rounds": roundDictionaries(session.rounds), "startedAt": milliseconds(session.startedAt), "scopeLabel": session.scopeLabel]
        if let timeLimitSeconds = session.timeLimitSeconds { result["timeLimitSeconds"] = timeLimitSeconds }
        if let deadline = session.deadline { result["timerDeadline"] = milliseconds(deadline) }
        if session.timerIsPaused {
            result["timerIsPaused"] = true
            if let remaining = session.pausedRemainingTimeSeconds { result["pausedRemainingTimeSeconds"] = remaining }
        }
        if session.kind == .learning { result["batchNumber"] = groupNumber(for: session.groupID) }
        else if let group = groups.first(where: { $0.id == session.groupID }) {
            result["scope"] = "group"
            result["testNumber"] = session.testNumber ?? 1
            result["groupLabel"] = "第 \(group.number) 組"
        } else {
            result["scope"] = "unit"
            result["testNumber"] = session.testNumber ?? 1
            result["groupLabel"] = "全部單字"
        }
        return result
    }

    private func responseDictionaries(_ responses: [StudyResponse]) -> [[String: Any]] { responses.map { ["wordId": $0.wordID, "known": $0.known, "round": $0.round, "at": milliseconds($0.answeredAt)] } }
    private func roundDictionaries(_ rounds: [TestRound]) -> [[String: Any]] { rounds.map { ["round": $0.round, "wordIds": $0.wordIDs, "known": $0.known, "unknown": $0.unknown, "completedAt": milliseconds(Date())] } }
    private func prepend(_ record: [String: Any], to key: String) { var records = rawState[key] as? [[String: Any]] ?? []; records.insert(record, at: 0); rawState[key] = records }
    private func groupNumber(for groupID: String) -> Int { groups.first(where: { $0.id == groupID })?.number ?? 0 }
    private func difficultyCounts(_ wordIDs: [String]) -> [String: Int] { Dictionary(uniqueKeysWithValues: ["A", "B", "C"].map { difficulty in (difficulty, wordIDs.filter { word(for: $0)?.initialDifficulty == difficulty }.count) }) }
    private func word(for id: String) -> StudyWord? { wordsByID[id] }
    private func shuffled<T>(_ values: [T]) -> [T] { values.shuffled() }
    private func identifier() -> String { "ios-\(UUID().uuidString.lowercased())" }
    private func milliseconds(_ date: Date) -> Double { date.timeIntervalSince1970 * 1_000 }
    private func date(milliseconds value: Any?) -> Date? { guard let value = number(value) else { return nil }; return Date(timeIntervalSince1970: value / 1_000) }
    private func number(_ value: Any?) -> Double? { (value as? NSNumber)?.doubleValue ?? (value as? Double) }
    private func integer(_ value: Any?) -> Int? { (value as? NSNumber)?.intValue ?? (value as? Int) }
    private func normalizedSearchText(_ text: String) -> String {
        text
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .folding(options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive], locale: .current)
            .lowercased()
    }
    // A study day runs from 05:00 in Taipei to 04:59 the following day.
    private func studyDayStart(containing date: Date) -> Date {
        let shifted = taipeiCalendar.date(byAdding: .hour, value: -5, to: date) ?? date
        let midnight = taipeiCalendar.startOfDay(for: shifted)
        return taipeiCalendar.date(byAdding: .hour, value: 5, to: midnight) ?? midnight
    }

    private func nextStudyDayStart(after date: Date, days: Int) -> Date {
        taipeiCalendar.date(byAdding: .day, value: days, to: studyDayStart(containing: date)) ?? date
    }

    private func dayKey(_ date: Date) -> String {
        let parts = taipeiCalendar.dateComponents([.year, .month, .day], from: studyDayStart(containing: date))
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    private func updateRawWord(_ id: String, mutate: (inout [String: Any]) -> Void) {
        guard var rawWords = rawState["words"] as? [[String: Any]], let index = rawWords.firstIndex(where: { ($0["id"] as? String) == id }) else { return }
        mutate(&rawWords[index])
        rawState["words"] = rawWords
        if let mastery = rawWords[index]["mastery"] as? [String: Any] {
            masteryByWordID[id] = mastery
        } else {
            masteryByWordID.removeValue(forKey: id)
        }
    }

    private func loadSavedBackup() {
        guard let data = try? Data(contentsOf: storageURL), let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        rawState = object
        normalizeBooks()
        migrateMasteryModelV6()
        let materializedGroups = materializeMissingStudyGroups()
        hydrate()
        let repairedRecovery = repairStalledRecoveryResults()
        if repairedRecovery { hydrate() }
        if ensureGroupReviewSchedules() || repairedRecovery || materializedGroups {
            try? encodedBackup().write(to: storageURL, options: .atomic)
            hydrate()
        }
        backupDate = (try? storageURL.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
    }

    private func persist(refresh: Bool = false) {
        if refresh { hydrate() }
        pendingActiveSessionPersistence?.cancel()
        pendingActiveSessionPersistence = nil
        let snapshot = rawState
        let destination = storageURL
        enqueuePersistence(snapshot: snapshot, destination: destination)
    }

    /// Called when the scene enters the background. It flushes the newest
    /// snapshot through the same serial writer before iOS suspends the app.
    func flushPersistence() {
        pendingActiveSessionPersistence?.cancel()
        pendingActiveSessionPersistence = nil
        let snapshot = rawState
        let destination = storageURL
        do {
            try Self.persistenceQueue.sync {
                try Self.write(snapshot: snapshot, to: destination)
            }
        } catch {
            lastError = "這次操作沒有成功保存，原本的資料仍保留在裝置上。"
        }
    }

    private func enqueuePersistence(snapshot: [String: Any], destination: URL) {
        Self.persistenceQueue.async { [weak self] in
            do {
                try Self.write(snapshot: snapshot, to: destination)
            } catch {
                Task { @MainActor [weak self] in
                    self?.lastError = "這次操作沒有成功保存，原本的資料仍保留在裝置上。"
                }
            }
        }
    }

    nonisolated private static func write(snapshot: [String: Any], to destination: URL) throws {
        // Internal snapshots are compact because they are written frequently.
        // Exported user backups remain pretty-printed in `encodedBackup`.
        let data = try JSONSerialization.data(withJSONObject: snapshot, options: [])
        try data.write(to: destination, options: .atomic)
    }

    private func encodedBackup() -> Data { (try? JSONSerialization.data(withJSONObject: rawState, options: [.prettyPrinted, .sortedKeys])) ?? Data("{}".utf8) }

    private func normalizeBooks() {
        var rawBooks = rawState["books"] as? [[String: Any]] ?? []
        var rawUnits = rawState["units"] as? [[String: Any]] ?? []

        if rawBooks.isEmpty {
            rawBooks = [["id": "ios-default-book", "name": "進階英單"]]
        }

        for index in rawBooks.indices where rawBooks[index]["name"] as? String == "我的單字書" {
            rawBooks[index]["name"] = "進階英單"
        }

        let validBookIDs = Set(rawBooks.compactMap { $0["id"] as? String })
        guard let fallbackBookID = validBookIDs.first else { return }
        for index in rawUnits.indices {
            if let bookID = rawUnits[index]["bookId"] as? String, validBookIDs.contains(bookID) { continue }
            rawUnits[index]["bookId"] = fallbackBookID
        }

        rawState["books"] = rawBooks
        rawState["units"] = rawUnits
        rawState["version"] = max(integer(rawState["version"]) ?? 0, 11)
    }

    /// Legacy backups did not persist their 20-word groups.  Create them once
    /// in source order and save them with the backup, so later app versions
    /// cannot silently move a learned word into a different group.
    @discardableResult
    private func materializeMissingStudyGroups() -> Bool {
        var storedGroups = rawState["studyGroups"] as? [[String: Any]] ?? []
        let groupedUnitIDs = Set(storedGroups.compactMap { $0["unitId"] as? String })
        let rawWords = rawState["words"] as? [[String: Any]] ?? []
        let unitIDs = Set(rawWords.compactMap { $0["unitId"] as? String })
        var didMaterialize = false

        for unitID in unitIDs where !groupedUnitIDs.contains(unitID) {
            let wordIDs = rawWords.compactMap { word -> String? in
                guard word["unitId"] as? String == unitID else { return nil }
                return word["id"] as? String
            }
            guard !wordIDs.isEmpty else { continue }

            for start in stride(from: 0, to: wordIDs.count, by: 20) {
                let number = start / 20 + 1
                storedGroups.append([
                    "id": "generated-\(unitID)-\(number)",
                    "unitId": unitID,
                    "groupNumber": number,
                    "wordIds": Array(wordIDs[start..<min(start + 20, wordIDs.count)])
                ])
            }
            didMaterialize = true
        }

        if didMaterialize {
            rawState["studyGroups"] = storedGroups
        }
        return didMaterialize
    }

    private func migrateMasteryModelV6() {
        let rawWords = rawState["words"] as? [[String: Any]] ?? []
        guard rawWords.contains(where: { word in
            guard word["initialDifficulty"] as? String != nil else { return false }
            return (integer((word["mastery"] as? [String: Any])?["modelVersion"]) ?? 0) < 6
        }) else { return }

        var resetWords = rawWords
        for index in resetWords.indices {
            guard let difficulty = resetWords[index]["initialDifficulty"] as? String else { continue }
            let establishedAt = date(milliseconds: (resetWords[index]["initialLearning"] as? [String: Any])?["completedAt"])
                ?? date(milliseconds: resetWords[index]["createdAt"])
                ?? .now
            resetWords[index]["mastery"] = initialMastery(difficulty: difficulty, establishedAt: establishedAt)
        }
        rawState["words"] = resetWords

        // A Unit starts its retention schedule only after every one of its
        // groups has completed initial learning.  Older backups are rebuilt
        // with the latest initial-learning time as that shared start point.
        let unitIDs = Set(resetWords.compactMap { $0["unitId"] as? String })
        for unitID in unitIDs {
            let unitWords = resetWords.filter { ($0["unitId"] as? String) == unitID }
            guard !unitWords.isEmpty,
                  unitWords.allSatisfy({ $0["initialDifficulty"] as? String != nil }) else { continue }
            let activatedAt = unitWords.compactMap {
                date(milliseconds: ($0["initialLearning"] as? [String: Any])?["completedAt"])
            }.max() ?? .now
            activateUnitReviewIfReady(unitID: unitID, activatedAt: activatedAt)
        }

        let testRecords = (rawState["tests"] as? [[String: Any]] ?? []).sorted {
            (date(milliseconds: $0["completedAt"]) ?? date(milliseconds: $0["startedAt"]) ?? .distantPast)
                < (date(milliseconds: $1["completedAt"]) ?? date(milliseconds: $1["startedAt"]) ?? .distantPast)
        }
        for record in testRecords {
            var scoredWordIDs = Set<String>()
            for response in record["responses"] as? [[String: Any]] ?? [] {
                guard let wordID = response["wordId"] as? String,
                      !scoredWordIDs.contains(wordID),
                      (integer(response["round"]) ?? 1) == 1,
                      let known = response["known"] as? Bool else { continue }
                scoredWordIDs.insert(wordID)
                let testedAt = date(milliseconds: response["at"])
                    ?? date(milliseconds: record["completedAt"])
                    ?? date(milliseconds: record["startedAt"])
                    ?? .now
                applyTestResult(wordID, known: known, testedAt: testedAt)
            }
        }
    }

    @discardableResult
    private func ensureGroupReviewSchedules() -> Bool {
        var schedules = rawState["groupReviewSchedules"] as? [String: [String: Any]] ?? [:]
        var didChange = false

        for group in groups {
            let groupWords = words(in: group)
            guard !groupWords.isEmpty,
                  groupWords.allSatisfy({ $0.initialDifficulty != nil }) else { continue }

            if schedules[group.id] == nil {
                let normalWords = groupWords.filter { !isRecoveryWord($0) }
                let sourceWords = normalWords.isEmpty ? groupWords : normalWords
                let stage = sourceWords.map { max(1, min(7, integer(rawMastery(for: $0.id)?["stage"]) ?? 1)) }.min() ?? 1
                let anchor = sourceWords.compactMap { date(milliseconds: rawMastery(for: $0.id)?["reviewAnchorAt"]) }
                    .min() ?? studyDayStart(containing: .now)
                let dueAt = sourceWords.compactMap { $0.nextDueAt }.min()
                    ?? nextStudyDayStart(after: anchor, days: intervalDays(for: stage))
                schedules[group.id] = [
                    "modelVersion": 8,
                    "stage": stage,
                    "reviewAnchorAt": milliseconds(anchor),
                    "nextDueAt": milliseconds(dueAt),
                    "hasPassedFinalReview": false
                ]
                didChange = true
            }

            guard var schedule = schedules[group.id],
                  date(milliseconds: schedule["nextDueAt"]) != nil else { continue }
            if (integer(schedule["modelVersion"]) ?? 0) < 8 {
                let anchor = date(milliseconds: schedule["reviewAnchorAt"]) ?? .distantPast
                let formalRecords = tests
                    .filter {
                        $0.groupID == group.id
                            && $0.scopeLabel.contains("今日到期複習")
                            && ($0.completedAt ?? .distantPast) >= anchor
                    }
                    .sorted { ($0.completedAt ?? .distantPast) < ($1.completedAt ?? .distantPast) }
                if let lastFormalReview = formalRecords.last?.completedAt {
                    let completedCount = formalRecords.count
                    let nextStage = completedCount >= 7 ? 7 : completedCount + 1
                    let precedingStage = nextStage == 7 && completedCount >= 7
                        ? 7
                        : max(1, nextStage - 1)
                    let gapDays = [1, 3, 7, 14, 30, 30, 30][precedingStage - 1]
                    schedule["stage"] = nextStage
                    schedule["nextDueAt"] = milliseconds(nextStudyDayStart(after: lastFormalReview, days: gapDays))
                    schedule["lastCompletedAt"] = milliseconds(lastFormalReview)
                }
                schedule["modelVersion"] = 8
                schedules[group.id] = schedule
                didChange = true
            }

            // Recalculate existing schedules so the new interval sequence also
            // applies to groups that were already in progress.
            if (integer(schedule["modelVersion"]) ?? 0) < 9 {
                let anchor = date(milliseconds: schedule["reviewAnchorAt"]) ?? .now
                let stage = max(1, min(7, integer(schedule["stage"]) ?? 1))
                schedule["nextDueAt"] = milliseconds(nextStudyDayStart(after: anchor, days: intervalDays(for: stage)))
                schedule["modelVersion"] = 9
                schedules[group.id] = schedule
                didChange = true
            }

            guard let synchronizedDueAt = date(milliseconds: schedule["nextDueAt"]) else { continue }
            let stage = max(1, min(7, integer(schedule["stage"]) ?? 1))
            for word in groupWords where !isRecoveryWord(word) {
                updateRawWord(word.id) { rawWord in
                    guard var mastery = rawWord["mastery"] as? [String: Any] else { return }
                    let existingStage = integer(mastery["stage"])
                    let existingDueAt = date(milliseconds: mastery["nextDueAt"])
                    guard existingStage != stage || existingDueAt != synchronizedDueAt || integer(mastery["modelVersion"]) != 7 else { return }
                    mastery["modelVersion"] = 7
                    mastery["stage"] = stage
                    mastery["nextDueAt"] = milliseconds(synchronizedDueAt)
                    rawWord["mastery"] = syncedMastery(mastery, stage: stage)
                    didChange = true
                }
            }
        }

        if didChange { rawState["groupReviewSchedules"] = schedules }
        return didChange
    }

    @discardableResult
    private func activateGroupReviewIfReady(groupID: String, activatedAt: Date) -> Bool {
        guard let group = groups.first(where: { $0.id == groupID }) else { return false }
        let groupWords = words(in: group)
        guard !groupWords.isEmpty,
              groupWords.allSatisfy({ $0.initialDifficulty != nil }),
              groupReviewSchedule(for: group) == nil else { return false }

        let anchor = studyDayStart(containing: activatedAt)
        let dueAt = nextStudyDayStart(after: anchor, days: 1)
        updateGroupReviewSchedule([
            "modelVersion": 8,
            "stage": 1,
            "reviewAnchorAt": milliseconds(anchor),
            "nextDueAt": milliseconds(dueAt),
            "hasPassedFinalReview": false
        ], for: groupID)
        for word in groupWords {
            updateRawWord(word.id) { rawWord in
                guard var mastery = rawWord["mastery"] as? [String: Any] else { return }
                mastery["modelVersion"] = 7
                mastery["stage"] = 1
                mastery["needsRecovery"] = false
                mastery["isRecoveryConfirmation"] = false
                mastery["recoveryTargetStage"] = NSNull()
                mastery["hasPassedFinalReview"] = false
                mastery["reviewAnchorAt"] = milliseconds(anchor)
                mastery["nextDueAt"] = milliseconds(dueAt)
                rawWord["mastery"] = syncedMastery(mastery, stage: 1)
            }
        }
        return true
    }

    @discardableResult
    private func activateUnitReviewIfReady(unitID: String, activatedAt: Date) -> Bool {
        var rawWords = rawState["words"] as? [[String: Any]] ?? []
        let indexes = rawWords.indices.filter { rawWords[$0]["unitId"] as? String == unitID }
        guard !indexes.isEmpty,
              indexes.allSatisfy({ rawWords[$0]["initialDifficulty"] as? String != nil }) else { return false }

        let anchor = studyDayStart(containing: activatedAt)
        var didActivate = false
        for index in indexes {
            var mastery = rawWords[index]["mastery"] as? [String: Any] ?? [:]
            guard date(milliseconds: mastery["reviewAnchorAt"]) == nil else { continue }
            let stage = max(1, min(7, integer(mastery["stage"]) ?? 1))
            mastery["modelVersion"] = 6
            mastery["reviewAnchorAt"] = milliseconds(anchor)
            mastery["nextDueAt"] = milliseconds(nextStudyDayStart(after: anchor, days: 1))
            rawWords[index]["mastery"] = syncedMastery(mastery, stage: stage)
            didActivate = true
        }
        rawState["words"] = rawWords
        return didActivate
    }

    private enum ImportError: Error { case invalidBackup }
}
