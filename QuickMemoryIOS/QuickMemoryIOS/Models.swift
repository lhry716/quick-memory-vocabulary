import Foundation
import UniformTypeIdentifiers
import SwiftUI

struct StudyBook: Identifiable, Hashable {
    let id: String
    let name: String
}

struct StudyUnit: Identifiable, Hashable {
    let id: String
    let bookID: String
    let name: String
}

struct StudyWord: Identifiable, Hashable {
    let id: String
    let unitID: String
    let term: String
    let meaning: String
    let initialDifficulty: String?
    let masteryStage: Int
    let nextDueAt: Date?
}

struct StudyGroup: Identifiable, Hashable {
    let id: String
    let unitID: String
    let number: Int
    let wordIDs: [String]
}

/// A single word together with its location in the learner's library.
/// `groupNumber` remains optional so imported words without a study group can
/// still be found instead of being silently hidden from search.
struct WordLibrarySearchResult: Identifiable, Hashable {
    let word: StudyWord
    let unit: StudyUnit
    let groupNumber: Int?

    var id: String { word.id }
}

/// A temporary, app-generated batch for words that are in the Recovery flow.
/// Unlike normal review, Recovery deliberately ignores the original study
/// groups so only the words that need extra proof are shown together.
struct RecoveryReviewBatch: Identifiable, Hashable {
    let id: String
    let unitID: String
    let number: Int
    let wordIDs: [String]
    let recoveryCount: Int
    let confirmationCount: Int
}

enum StudySessionKind: String, Hashable {
    case learning
    case test
}

struct StudyResponse: Identifiable, Hashable {
    let id = UUID()
    let wordID: String
    let known: Bool
    let round: Int
    let answeredAt: Date
}

struct TestRound: Identifiable, Hashable {
    let round: Int
    let wordIDs: [String]
    let known: Int
    let unknown: Int

    var id: Int { round }
}

struct TestRecord: Identifiable, Hashable {
    let id: String
    let unitID: String
    let groupID: String?
    let groupLabel: String?
    let scopeLabel: String
    let testNumber: Int?
    let completedAt: Date?
    let wordIDs: [String]
    let responses: [StudyResponse]
    let rounds: [TestRound]

    var roundCount: Int { max(1, rounds.count) }

    var firstRound: TestRound {
        rounds.first(where: { $0.round == 1 }) ?? TestRound(
            round: 1,
            wordIDs: wordIDs,
            known: responses.filter { $0.round == 1 && $0.known }.count,
            unknown: responses.filter { $0.round == 1 && !$0.known }.count
        )
    }
}

struct WordStruggleStat: Identifiable, Hashable {
    let word: StudyWord
    let retryTestCount: Int
    let totalRetryRounds: Int
    let maxRound: Int

    var id: String { word.id }
}

struct StudySession: Identifiable, Hashable {
    let id: String
    let kind: StudySessionKind
    let unitID: String
    let groupID: String
    let wordIDs: [String]
    var queue: [String]
    var index: Int = 0
    var round: Int = 1
    var isFlipped = false
    var responses: [StudyResponse] = []
    var rounds: [TestRound] = []
    let startedAt: Date
    /// Optional per-session countdown, capped by the UI at 20 minutes.
    let timeLimitSeconds: Int?
    let scopeLabel: String
    let testNumber: Int?

    /// Kept separately from `startedAt` so a temporarily saved session can
    /// freeze its countdown without changing the session's actual start time.
    var timerDeadline: Date? = nil
    var timerIsPaused = false
    var pausedRemainingTimeSeconds: Int? = nil

    var currentWordID: String? { queue.indices.contains(index) ? queue[index] : nil }
    var isLearning: Bool { kind == .learning }

    var deadline: Date? {
        guard let timeLimitSeconds else { return nil }
        guard !timerIsPaused else { return nil }
        return timerDeadline ?? startedAt.addingTimeInterval(TimeInterval(timeLimitSeconds))
    }

    mutating func pauseTimer(at date: Date = .now) {
        guard let deadline else { return }
        pausedRemainingTimeSeconds = max(0, Int(ceil(deadline.timeIntervalSince(date))))
        timerDeadline = nil
        timerIsPaused = true
    }

    mutating func resumeTimer(at date: Date = .now) {
        guard timerIsPaused else { return }
        if let pausedRemainingTimeSeconds {
            timerDeadline = date.addingTimeInterval(TimeInterval(pausedRemainingTimeSeconds))
        }
        self.pausedRemainingTimeSeconds = nil
        timerIsPaused = false
    }
}

struct CompletionSummary: Hashable {
    let kind: StudySessionKind
    let title: String
    let detail: String
    let knownCount: Int
    let unknownCount: Int
    let roundCount: Int
    let timedOut: Bool
}

struct BackupDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    static var writableContentTypes: [UTType] { [.json] }

    var data: Data

    init(data: Data = Data("{}".utf8)) {
        self.data = data
    }

    init(configuration: ReadConfiguration) throws {
        data = configuration.file.regularFileContents ?? Data()
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}
