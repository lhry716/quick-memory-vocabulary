import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @ObservedObject var store: StudyStore
    @State private var isImporting = false
    @State private var isSettingsPresented = false

    var body: some View {
        Group {
            if store.hasBackup { HomeView(store: store, isSettingsPresented: $isSettingsPresented) }
            else { ImportWelcome(isImporting: $isImporting) }
        }
        .fileImporter(isPresented: $isImporting, allowedContentTypes: [.json]) { result in
            guard case let .success(url) = result else { return }
            let granted = url.startAccessingSecurityScopedResource()
            defer { if granted { url.stopAccessingSecurityScopedResource() } }
            guard let data = try? Data(contentsOf: url) else { return }
            store.importBackup(data)
        }
        .sheet(isPresented: $isSettingsPresented) { SettingsView(store: store, isImporting: $isImporting).presentationDetents([.medium]) }
        .alert("無法匯入", isPresented: Binding(get: { store.lastError != nil }, set: { if !$0 { store.lastError = nil } })) {
            Button("知道了", role: .cancel) { store.lastError = nil }
        } message: { Text(store.lastError ?? "") }
    }
}

private struct ImportWelcome: View {
    @Binding var isImporting: Bool
    var body: some View {
        ZStack {
            Color.graphiteBlack.ignoresSafeArea()
            VStack(spacing: 24) {
                Image(systemName: "rectangle.stack.badge.plus").font(.system(size: 42, weight: .medium)).foregroundStyle(.tint).symbolRenderingMode(.hierarchical)
                VStack(spacing: 8) {
                    Text("快速記憶法").font(.system(size: 30, weight: .bold, design: .rounded))
                    Text("匯入網站的 JSON 備份後，\n單字、組別與完整學習紀錄都會保留在這台裝置。")
                        .font(.body).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }
                Button("匯入 JSON 備份") { isImporting = true }.buttonStyle(.borderedProminent).controlSize(.large)
                Text("在網站開啟「資料管理 → 匯出 JSON」即可取得備份檔。").font(.footnote).foregroundStyle(.tertiary).multilineTextAlignment(.center).padding(.horizontal, 28)
            }.padding(32)
        }
    }
}

private struct HomeView: View {
    @ObservedObject var store: StudyStore
    @Binding var isSettingsPresented: Bool
    @State private var navigationPath = NavigationPath()
    @State private var isBookPickerPresented = false
    @State private var wordSearchText = ""
    @State private var settledWordSearchText = ""
    @State private var searchDebounceTask: Task<Void, Never>?

    private var gsatCountdownTitle: String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Taipei") ?? .current
        let today = calendar.startOfDay(for: Date())
        let examDay = calendar.date(from: DateComponents(year: 2027, month: 1, day: 22))!
        let remainingDays = calendar.dateComponents([.day], from: today, to: examDay).day ?? 0

        return remainingDays >= 0 ? "D-\(remainingDays)" : "學測加油"
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            List {
                if let active = store.activeSession, let unit = store.units.first(where: { $0.id == active.unitID }) {
                    Section {
                        NavigationLink(value: active) { ResumeRow(unit: unit, session: active, paused: false) }
                            .listRowInsets(.init(top: 6, leading: 16, bottom: 6, trailing: 16))
                            .listRowBackground(UnitSectionRowBackground(index: 0, count: 1))
                    }
                } else if let paused = store.pausedSession, let unit = store.units.first(where: { $0.id == paused.unitID }) {
                    Section {
                        Button {
                            store.resumePausedSession()
                            if let resumedSession = store.activeSession {
                                navigationPath.append(resumedSession)
                            }
                        } label: { ResumeRow(unit: unit, session: paused, paused: true) }
                            .buttonStyle(.plain)
                            .listRowInsets(.init(top: 6, leading: 16, bottom: 6, trailing: 16))
                            .listRowBackground(UnitSectionRowBackground(index: 0, count: 1))
                    }
                }
                if !settledWordSearchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    WordLibrarySearchSection(
                        query: settledWordSearchText,
                        results: store.searchWords(matching: settledWordSearchText),
                        selectResult: { result in
                            searchDebounceTask?.cancel()
                            wordSearchText = ""
                            settledWordSearchText = ""
                            navigationPath.append(UnitDestination(
                                unit: result.unit,
                                initialTab: .words,
                                highlightedWordID: result.word.id
                            ))
                        }
                    )
                } else if let book = store.selectedBook {
                    let bookUnits = store.units(in: book)
                    Section("全部 Unit") {
                        ForEach(Array(bookUnits.enumerated()), id: \.element.id) { index, unit in
                            NavigationLink(value: UnitDestination(unit: unit, initialTab: .groups)) {
                                UnitRow(
                                    unit: unit,
                                    learned: store.learnedCount(in: unit),
                                    stable: store.stableCount(in: unit),
                                    due: store.dueCount(in: unit),
                                    total: store.words(in: unit).count,
                                    mastery: store.masteryProgress(in: unit)
                                )
                            }
                            .listRowInsets(.init(
                                top: index == 0 ? 12 : 6,
                                leading: 16,
                                bottom: index == bookUnits.count - 1 ? 12 : 6,
                                trailing: 16
                            ))
                            .listRowBackground(UnitSectionRowBackground(index: index, count: bookUnits.count))
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.graphiteBlack)
            .navigationTitle(gsatCountdownTitle)
            .searchable(text: $wordSearchText, prompt: "搜尋英文單字或中文意思")
            .onChange(of: wordSearchText) { _, newValue in
                scheduleSearch(for: newValue)
            }
            .onDisappear {
                searchDebounceTask?.cancel()
            }
            .navigationDestination(for: UnitDestination.self) { destination in
                UnitDetailView(
                    store: store,
                    unit: destination.unit,
                    initialTab: destination.initialTab,
                    highlightedWordID: destination.highlightedWordID
                )
            }
            .navigationDestination(for: StudySession.self) { session in
                SessionView(store: store) {
                    // A session resumed from Home still belongs to a Unit.  Keep
                    // its exit destination consistent with sessions started
                    // inside that Unit instead of dropping the learner at Home.
                    guard let unit = store.units.first(where: { $0.id == session.unitID }) else {
                        navigationPath = NavigationPath()
                        return
                    }
                    var unitPath = NavigationPath()
                    unitPath.append(UnitDestination(
                        unit: unit,
                        initialTab: session.returnsToReviewTab ? .records : .groups
                    ))
                    navigationPath = unitPath
                }
            }
            .navigationDestination(for: TestRecord.self) { TestRecordView(store: store, record: $0) }
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { isBookPickerPresented = true } label: {
                        Image(systemName: "books.vertical")
                    }
                    .accessibilityLabel("切換書籍，目前為 \(store.selectedBook?.name ?? "未選擇")")
                    Button { isSettingsPresented = true } label: { Image(systemName: "ellipsis.circle") }
                        .accessibilityLabel("資料管理")
                }
            }
            .sheet(isPresented: $isBookPickerPresented) {
                BookPickerSheet(store: store)
                    .presentationDetents([.height(300)])
            }
        }
    }

    private func scheduleSearch(for query: String) {
        searchDebounceTask?.cancel()
        guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            settledWordSearchText = ""
            return
        }
        searchDebounceTask = Task { @MainActor in
            do {
                try await Task.sleep(nanoseconds: 250_000_000)
            } catch {
                return
            }
            guard !Task.isCancelled else { return }
            settledWordSearchText = query
        }
    }
}

private struct WordLibrarySearchSection: View {
    let query: String
    let results: [WordLibrarySearchResult]
    let selectResult: (WordLibrarySearchResult) -> Void

    var body: some View {
        Section("單字庫搜尋 · \(results.count) 筆") {
            if results.isEmpty {
                ContentUnavailableView.search(text: query)
                    .listRowBackground(Color.clear)
            } else {
                ForEach(results) { result in
                    Button {
                        selectResult(result)
                    } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(result.word.term)
                                .font(.headline)
                            Text(result.word.meaning)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            Label(locationText(for: result), systemImage: "mappin.and.ellipse")
                                .font(.caption)
                                .foregroundStyle(Color.graphitePrimary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 3)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func locationText(for result: WordLibrarySearchResult) -> String {
        guard let groupNumber = result.groupNumber else {
            return "\(result.unit.name) · 尚未分組"
        }
        return "\(result.unit.name) · 第 \(groupNumber) 組"
    }
}

private struct UnitDestination: Hashable {
    let unit: StudyUnit
    let initialTab: UnitTab
    let highlightedWordID: String?

    init(unit: StudyUnit, initialTab: UnitTab, highlightedWordID: String? = nil) {
        self.unit = unit
        self.initialTab = initialTab
        self.highlightedWordID = highlightedWordID
    }
}

private extension StudySession {
    /// Review sessions can be resumed from Home.  When they finish, restore
    /// the review tab instead of showing the Unit's default group list.
    var returnsToReviewTab: Bool {
        scopeLabel.contains("今日到期複習")
            || scopeLabel.contains("今日複習重看")
            || scopeLabel.hasPrefix("Recovery 第")
    }
}

private struct BookPickerSheet: View {
    @ObservedObject var store: StudyStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(store.books) { book in
                        Button {
                            store.selectedBookID = book.id
                            dismiss()
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "book.closed")
                                    .font(.body.weight(.medium))
                                    .foregroundStyle(Color.graphitePrimary)
                                    .frame(width: 24)

                                Text(book.name)
                                    .font(.title3.weight(.medium))
                                    .foregroundStyle(Color.graphiteText)

                                Spacer()

                                if store.selectedBookID == book.id {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(Color.graphitePrimary)
                                        .accessibilityLabel("目前使用")
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .accessibilityLabel(book.name)
                        .accessibilityValue(store.selectedBookID == book.id ? "目前使用" : "")
                        .listRowInsets(.init(top: 16, leading: 20, bottom: 16, trailing: 20))
                    }
                }
            }
            .listStyle(.insetGrouped)
        }
        .preferredColorScheme(.dark)
    }
}

private struct ResumeRow: View {
    let unit: StudyUnit
    let session: StudySession
    let paused: Bool
    var body: some View {
        HStack(spacing: 13) {
            Image(systemName: paused ? "pause.fill" : "play.fill")
                .font(.caption.weight(.bold))
                .foregroundStyle(Color.graphiteText)
                .frame(width: 34, height: 34)
                .background(Color.graphiteRaised, in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(paused ? "繼續暫存的練習" : "繼續上次的練習")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.graphiteText)
                Text(unit.name)
                    .font(.caption)
                    .foregroundStyle(Color.graphiteMuted)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 3) {
                Text(session.kind == .test ? "Test" : "初學")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.graphiteButtonText)
                Text("\(session.index + 1) / \(session.queue.count)")
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(Color.graphiteTertiary)
            }
        }
        .frame(minHeight: 42)
        .padding(.vertical, 4)
    }
}

private struct UnitRow: View {
    let unit: StudyUnit; let learned: Int; let stable: Int; let due: Int; let total: Int; let mastery: Double

    var body: some View {
        HStack(spacing: 13) {
            ProgressRing(progress: mastery)
            VStack(alignment: .leading, spacing: 5) {
                Text(unit.name).font(.headline)
                Text("已初學 \(learned) / \(total) · 穩定 \(stable)").font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
            if due > 0 {
                Image(systemName: "exclamationmark.circle.fill")
                .font(.title3)
                .foregroundStyle(Color.graphiteWarning)
                .accessibilityLabel("今天有 \(due) 個字需要複習")
            }
        }
        .padding(.vertical, 4)
    }
}

private struct UnitSectionRowBackground: View {
    let index: Int
    let count: Int

    var body: some View {
        let radius: CGFloat = 14

        if count == 1 {
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .fill(Color.graphiteSurface)
        } else if index == 0 {
            UnevenRoundedRectangle(
                topLeadingRadius: radius,
                bottomLeadingRadius: 0,
                bottomTrailingRadius: 0,
                topTrailingRadius: radius,
                style: .continuous
            )
            .fill(Color.graphiteSurface)
        } else if index == count - 1 {
            UnevenRoundedRectangle(
                topLeadingRadius: 0,
                bottomLeadingRadius: radius,
                bottomTrailingRadius: radius,
                topTrailingRadius: 0,
                style: .continuous
            )
            .fill(Color.graphiteSurface)
        } else {
            Color.graphiteSurface
        }
    }
}

private struct ProgressRing: View {
    let progress: Double
    var body: some View {
        ZStack {
            Circle().stroke(Color.graphiteSurface, lineWidth: 5)
            Circle().trim(from: 0, to: progress).stroke(.tint, style: .init(lineWidth: 5, lineCap: .round)).rotationEffect(.degrees(-90))
            Text("\(Int(progress * 100))%").font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
        }.frame(width: 42, height: 42)
    }
}

private struct UnitDetailView: View {
    @ObservedObject var store: StudyStore
    let unit: StudyUnit
    let highlightedWordID: String?
    @State private var tab: UnitTab
    @State private var sessionID: String?
    @State private var pendingStart: TimedStart?

    init(store: StudyStore, unit: StudyUnit, initialTab: UnitTab = .groups, highlightedWordID: String? = nil) {
        self.store = store
        self.unit = unit
        self.highlightedWordID = highlightedWordID
        _tab = State(initialValue: initialTab)
    }

    private enum TimedStart: Identifiable {
        case group(StudyGroup)
        case dueReview(StudyGroup)
        case reviewPractice(StudyGroup, [String])
        case recovery(RecoveryReviewBatch)
        case recoveryPractice(RecoveryReviewBatch, [String])

        var id: String {
            switch self {
            case .group(let group): return "group-\(group.id)"
            case .dueReview(let group): return "due-\(group.id)"
            case .reviewPractice(let group, _): return "practice-\(group.id)"
            case .recovery(let batch): return "recovery-\(batch.id)"
            case .recoveryPractice(let batch, _): return "recovery-practice-\(batch.id)"
            }
        }
    }

    var body: some View {
        Group {
            if let sessionID,
               (store.activeSession?.id == sessionID || store.completion != nil) {
                SessionView(store: store) { self.sessionID = nil }
                    .transition(.opacity)
            } else {
                VStack(spacing: 0) {
                    Picker("內容", selection: $tab) { ForEach(UnitTab.allCases) { Text($0.title).tag($0) } }
                        .pickerStyle(.segmented)
                        .tint(Color.graphitePrimary)
                        .padding(.horizontal)
                        .padding(.vertical, 12)
                    switch tab {
                    case .groups:
                        GroupList(store: store, unit: unit) { group in
                            requestStart(.group(group))
                        }
                    case .words: WordList(words: store.words(in: unit), highlightedWordID: highlightedWordID)
                    case .records:
                        ReviewGroupList(
                            store: store,
                            unit: unit,
                            openNormalSession: { group, completedReview in
                                requestStart(completedReview.map { .reviewPractice(group, $0.wordIDs) } ?? .dueReview(group))
                            },
                            openRecoverySession: { batch, completedReview in
                                requestStart(completedReview.map { .recoveryPractice(batch, $0.wordIDs) } ?? .recovery(batch))
                            }
                        )
                    }
                }
                .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.28), value: sessionID)
        .navigationTitle(unit.name)
        .navigationBarTitleDisplayMode(.inline)
        .overlay {
            if let request = pendingStart {
                ZStack(alignment: .bottom) {
                    Color.clear
                        .ignoresSafeArea()
                        .contentShape(Rectangle())
                        .onTapGesture {
                            withAnimation(.easeIn(duration: 0.22)) {
                                pendingStart = nil
                            }
                        }

                    TimerSetupView { minutes in
                        withAnimation(.easeInOut(duration: 0.28)) {
                            pendingStart = nil
                            start(request, timeLimitSeconds: minutes * 60)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .background(Color.black)
                    .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                    .padding(.horizontal, 12)
                    .padding(.bottom, 12)
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .zIndex(10)
            }
        }
        .alert("無法開始練習", isPresented: Binding(
            get: { store.lastError != nil },
            set: { if !$0 { store.lastError = nil } }
        )) {
            Button("知道了", role: .cancel) { store.lastError = nil }
        } message: {
            Text(store.lastError ?? "")
        }
    }

    private func requestStart(_ request: TimedStart) {
        // Resuming an existing session keeps its original countdown.
        if case .group(let group) = request,
           (store.activeSession?.groupID == group.id || store.pausedSession?.groupID == group.id) {
            store.start(group: group)
            sessionID = store.activeSession?.id
        } else {
            withAnimation(.easeOut(duration: 0.24)) {
                pendingStart = request
            }
        }
    }

    private func start(_ request: TimedStart, timeLimitSeconds: Int) {
        switch request {
        case .group(let group): store.start(group: group, timeLimitSeconds: timeLimitSeconds)
        case .dueReview(let group): store.startDueReview(in: group, timeLimitSeconds: timeLimitSeconds)
        case .reviewPractice(let group, let wordIDs): store.startReviewPractice(in: group, wordIDs: wordIDs, timeLimitSeconds: timeLimitSeconds)
        case .recovery(let batch): store.startRecoveryReview(batch, timeLimitSeconds: timeLimitSeconds)
        case .recoveryPractice(let batch, let wordIDs): store.startRecoveryPractice(batch, wordIDs: wordIDs, timeLimitSeconds: timeLimitSeconds)
        }
        if store.lastError == nil { sessionID = store.activeSession?.id }
    }
}

private struct TimerSetupView: View {
    @AppStorage("timerDurationMinutes") private var savedMinutes = 8
    @State private var minutes: Int?
    let start: (Int) -> Void

    private let rowHeight: CGFloat = 72
    private let wheelHeight: CGFloat = 360

    private var selectedMinutes: Binding<Int?> {
        Binding(
            get: { minutes },
            set: { value in
                guard let value else { return }
                let clamped = min(max(value, 1), 20)
                minutes = clamped
                savedMinutes = clamped
            }
        )
    }

    var body: some View {
        ZStack {
            Color.black

            ScrollView(.vertical, showsIndicators: false) {
                LazyVStack(spacing: 0) {
                    ForEach(1...20, id: \.self) { value in
                        Text("\(value)")
                            .font(.system(size: 44, weight: .ultraLight))
                            .monospacedDigit()
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .frame(height: rowHeight)
                            .visualEffect { content, proxy in
                                let midY = proxy.frame(in: .named("timer-wheel")).midY
                                let distance = abs(midY - wheelHeight / 2) / rowHeight
                                let opacity = distance < 1
                                    ? 1 - distance * 0.82
                                    : max(0.04, 0.18 - (distance - 1) * 0.10)
                                let scale = 1.5 - min(distance, 2) * 0.4
                                return content
                                    .opacity(distance > 3 ? 0 : opacity)
                                    .scaleEffect(scale)
                            }
                            .id(value)
                    }
                }
                .scrollTargetLayout()
            }
            .coordinateSpace(name: "timer-wheel")
            .scrollPosition(id: selectedMinutes, anchor: .center)
            .scrollTargetBehavior(.viewAligned)
            .contentMargins(.vertical, (wheelHeight - rowHeight) / 2, for: .scrollContent)
            .frame(height: wheelHeight)
            .mask(
                LinearGradient(
                    stops: [
                        .init(color: .clear, location: 0),
                        .init(color: .black, location: 0.3),
                        .init(color: .black, location: 0.7),
                        .init(color: .clear, location: 1)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .overlay {
                Text("min")
                    .font(.system(size: 17))
                    .foregroundStyle(Color(white: 0.56))
                    .offset(x: 62, y: 6)
                    .allowsHitTesting(false)
            }
            .onAppear {
                minutes = min(max(savedMinutes, 1), 20)
            }

            VStack {
                Spacer()
                Button {
                    let selected = min(max(minutes ?? savedMinutes, 1), 20)
                    savedMinutes = selected
                    start(selected)
                } label: {
                    Text("Start")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(.black)
                        .frame(width: 88, height: 88)
                        .background(Circle().fill(Color(white: 0.91)))
                }
                .buttonStyle(TimerPressScaleStyle())
                .padding(.bottom, 24)
            }
        }
        .frame(height: 430)
        .sensoryFeedback(.selection, trigger: minutes)
        .preferredColorScheme(.dark)
    }
}

private struct TimerPressScaleStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

private enum UnitTab: String, CaseIterable, Identifiable {
    case groups, words, records
    var id: Self { self }
    var title: String { switch self { case .groups: "組別"; case .words: "單字"; case .records: "複習" } }
}

private struct GroupList: View {
    @ObservedObject var store: StudyStore
    let unit: StudyUnit
    let openSession: (StudyGroup) -> Void

    var body: some View {
        List {
            ForEach(store.groups(in: unit)) { group in
                let progress = store.progress(in: group)
                let strugglingCount = store.strugglingCount(in: group)
                let testCount = store.testCount(in: group)
                StudyGroupCard(store: store, group: group, progress: progress, strugglingCount: strugglingCount, testCount: testCount) {
                    openSession(group)
                }
                .listRowInsets(.init(top: 6, leading: 16, bottom: 6, trailing: 16))
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color.graphiteBlack)
    }
}

private struct ReviewGroupList: View {
    @ObservedObject var store: StudyStore
    let unit: StudyUnit
    let openNormalSession: (StudyGroup, TestRecord?) -> Void
    let openRecoverySession: (RecoveryReviewBatch, TestRecord?) -> Void

    var body: some View {
        let reviewGroups = store.groups(in: unit).filter {
            store.normalDueCount(in: $0) > 0 || store.completedDueReview(in: $0) != nil
        }
        let recoveryBatches = store.recoveryBatches(in: unit)
        Group {
            if reviewGroups.isEmpty && recoveryBatches.isEmpty {
                ContentUnavailableView(
                    "今天已完成複習",
                    systemImage: "checkmark.circle",
                    description: Text("這個 Unit 目前沒有到期單字。")
                )
            } else {
                List {
                    if !reviewGroups.isEmpty {
                        Section("正式複習") {
                            ForEach(reviewGroups) { group in
                                let due = store.normalDueCount(in: group)
                                ReviewGroupCard(
                                    group: group,
                                    due: due,
                                    total: store.words(in: group).count,
                                    detail: store.normalReviewDetail(in: group),
                                    completedReview: store.completedDueReview(in: group)
                                ) {
                                    openNormalSession(group, due == 0 ? store.completedDueReview(in: group) : nil)
                                }
                                .listRowInsets(.init(top: 6, leading: 16, bottom: 6, trailing: 16))
                                .listRowSeparator(.hidden)
                                .listRowBackground(Color.clear)
                            }
                        }
                    }
                    if !recoveryBatches.isEmpty {
                        Section("Recovery") {
                            ForEach(recoveryBatches) { batch in
                                let due = store.dueCount(in: batch)
                                RecoveryGroupCard(
                                    batch: batch,
                                    due: due,
                                    completedReview: store.completedRecoveryReview(in: batch)
                                ) {
                                    openRecoverySession(batch, due == 0 ? store.completedRecoveryReview(in: batch) : nil)
                                }
                                .listRowInsets(.init(top: 6, leading: 16, bottom: 6, trailing: 16))
                                .listRowSeparator(.hidden)
                                .listRowBackground(Color.clear)
                            }
                        }
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .background(Color.graphiteBlack)
            }
        }
    }
}

private struct ReviewGroupCard: View {
    let group: StudyGroup
    let due: Int
    let total: Int
    let detail: String
    let completedReview: TestRecord?
    let start: () -> Void

    private var isCompleted: Bool { due == 0 && completedReview != nil }
    private var reviewedCount: Int { completedReview?.wordIDs.count ?? 0 }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("第 \(group.number) 組")
                    .font(.headline)
                    .foregroundStyle(Color.graphiteText)
                Spacer()
                HStack(spacing: 5) {
                    Image(systemName: isCompleted ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                    Text(isCompleted ? "已完成" : "今天 \(due)")
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(isCompleted ? Color.graphitePrimary : Color.graphiteWarning)
                .accessibilityLabel(isCompleted ? "第 \(group.number) 組今天已完成複習" : "第 \(group.number) 組今天有 \(due) 個字需要複習")
            }
            ProgressView(value: Double(isCompleted ? total : max(total - due, 0)), total: Double(max(total, 1)))
                .tint(isCompleted ? Color.graphitePrimary : Color.graphiteWarning)
            HStack {
                Text(isCompleted ? "今天已複習 \(reviewedCount) 個" : "\(detail) · \(due) / \(total) 個")
                    .font(.subheadline)
                    .foregroundStyle(Color.graphiteMuted)
                Spacer()
                Button(isCompleted ? "再看一次" : "開始複習", action: start)
                    .buttonStyle(GroupTestButtonStyle())
                    .controlSize(.regular)
                    .accessibilityHint(isCompleted ? "重新練習第 \(group.number) 組今天完成的複習字，不影響排程" : "開始第 \(group.number) 組的到期複習")
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [Color.white.opacity(0.025), Color.graphiteSurface],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 18, style: .continuous)
        )
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.graphiteBorder, lineWidth: 1))
    }
}

private struct RecoveryGroupCard: View {
    let batch: RecoveryReviewBatch
    let due: Int
    let completedReview: TestRecord?
    let start: () -> Void

    private var isCompleted: Bool { due == 0 && completedReview != nil }
    private var reviewedCount: Int { completedReview?.wordIDs.count ?? 0 }

    private var detail: String {
        var parts: [String] = []
        let recoveryTotal = batch.recoveryCount + batch.confirmationCount
        if recoveryTotal > 0 { parts.append("Recovery \(recoveryTotal) 個") }
        return parts.isEmpty ? "今天已完成" : parts.joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Recovery 第 \(batch.number) 組")
                    .font(.headline)
                    .foregroundStyle(Color.graphiteText)
                Spacer()
                HStack(spacing: 5) {
                    Image(systemName: isCompleted ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                    Text(isCompleted ? "已完成" : "今天 \(due)")
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(isCompleted ? Color.graphitePrimary : Color.graphiteWarning)
            }
            ProgressView(value: Double(isCompleted ? batch.wordIDs.count : max(batch.wordIDs.count - due, 0)), total: Double(max(batch.wordIDs.count, 1)))
                .tint(isCompleted ? Color.graphitePrimary : Color.graphiteWarning)
            HStack {
                Text(isCompleted ? "今天已複習 \(reviewedCount) 個" : "\(detail) · 共 \(batch.wordIDs.count) 個")
                    .font(.subheadline)
                    .foregroundStyle(Color.graphiteMuted)
                Spacer()
                Button(isCompleted ? "再看一次" : "開始 Recovery", action: start)
                    .buttonStyle(GroupTestButtonStyle())
                    .controlSize(.regular)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [Color.graphiteWarning.opacity(0.08), Color.graphiteSurface],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 18, style: .continuous)
        )
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.graphiteBorder, lineWidth: 1))
    }
}

private struct StudyGroupCard: View {
    @ObservedObject var store: StudyStore
    let group: StudyGroup
    let progress: (completed: Int, total: Int)
    let strugglingCount: Int
    let testCount: Int
    let start: () -> Void
    private var isReadyForTest: Bool { progress.total > 0 && progress.completed == progress.total }
    private var actionTitle: String { isReadyForTest ? "Test 本組" : progress.completed > 0 ? "補完初學" : "開始初學" }
    private var status: String { isReadyForTest ? "可開始 Test" : progress.completed > 0 ? "初學進行中" : "尚未初學" }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("第 \(group.number) 組")
                    .font(.headline)
                    .foregroundStyle(Color.graphiteText)
                Spacer()
                VStack(alignment: .trailing, spacing: 3) {
                    Text(status)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(isReadyForTest ? Color.graphiteMuted : Color.graphiteTertiary)
                    Text("已測驗 \(testCount) 次")
                        .font(.caption2)
                        .foregroundStyle(Color.graphiteTertiary)
                }
            }
            ProgressView(value: Double(progress.completed), total: Double(max(progress.total, 1)))
                .tint(Color.graphiteControl)
                .animation(.easeOut(duration: 0.25), value: progress.completed)
            HStack {
                if isReadyForTest {
                    NavigationLink {
                        GroupStruggleView(store: store, group: group)
                    } label: {
                        HStack(spacing: 5) {
                            Text("反覆卡關 \(strugglingCount) 個")
                            Image(systemName: "chevron.right")
                                .font(.caption2.weight(.bold))
                        }
                        .font(.subheadline)
                        .foregroundStyle(strugglingCount > 0 ? Color.graphiteWarning : Color.graphiteMuted)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("查看第 \(group.number) 組反覆卡關單字，共 \(strugglingCount) 個")
                } else {
                    Text("初學 \(progress.completed) / \(progress.total)")
                        .font(.subheadline)
                        .foregroundStyle(Color.graphiteMuted)
                }
                Spacer()
                Button(actionTitle, action: start)
                    .buttonStyle(GroupTestButtonStyle())
                    .controlSize(.regular)
                    .accessibilityHint("開始第 \(group.number) 組練習")
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [Color.white.opacity(0.025), Color.graphiteSurface],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 18, style: .continuous)
        )
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.graphiteBorder, lineWidth: 1))
    }
}

private struct GroupTestButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.medium))
            .foregroundStyle(Color.graphiteButtonText)
            .padding(.horizontal, 17)
            .padding(.vertical, 10)
            .background(Color.graphiteRaised.opacity(configuration.isPressed ? 0.72 : 1), in: Capsule())
            .overlay(Capsule().stroke(Color.graphitePrimary.opacity(0.38), lineWidth: 1))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
    }
}

private struct GroupStruggleView: View {
    @ObservedObject var store: StudyStore
    let group: StudyGroup

    var body: some View {
        let strugglingWords = store.strugglingWords(in: group)
        Group {
            if strugglingWords.isEmpty {
                ContentUnavailableView(
                    "這組目前沒有反覆卡關的字",
                    systemImage: "checkmark.seal",
                    description: Text("完成更多 Test 後，需要多輪重測的單字會顯示在這裡。")
                )
            } else {
                List {
                    Section("反覆卡關") {
                        ForEach(strugglingWords) { stat in
                            StruggleWordRow(stat: stat)
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("第 \(group.number) 組卡關")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct WordList: View {
    let words: [StudyWord]
    let highlightedWordID: String?

    var body: some View {
        ScrollViewReader { proxy in
            List {
                ForEach(Array(words.enumerated()), id: \.element.id) { item in
                    let index = item.offset
                    let word = item.element
                    let isHighlighted = word.id == highlightedWordID
                    let followsHighlighted = index > 0 && words[index - 1].id == highlightedWordID

                    // Separators normally belong to the following row.  The
                    // highlighted row owns both of its separators, so its
                    // background extends above the upper line and below the
                    // lower line exactly as a single, tidy block.
                    VStack(spacing: 0) {
                        if index == 0 || !followsHighlighted {
                            Divider().padding(.leading, 20)
                        }

                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(word.term).font(.headline)
                                Spacer()
                            }
                            Text(word.meaning).font(.subheadline).foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)

                        if isHighlighted || index == words.count - 1 {
                            Divider().padding(.leading, 20)
                        }
                    }
                    .id(word.id)
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .background(isHighlighted ? Color.graphitePrimary.opacity(0.22) : Color.clear)
                }
            }
            .onAppear {
                guard let highlightedWordID else { return }
                DispatchQueue.main.async {
                    withAnimation(.easeInOut(duration: 0.28)) {
                        proxy.scrollTo(highlightedWordID, anchor: .center)
                    }
                }
            }
            .listStyle(.plain)
            .listRowSpacing(0)
        }
    }
}

private struct StruggleWordRow: View {
    let stat: WordStruggleStat

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(stat.word.term).font(.headline)
                    Text(stat.word.meaning).font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer()
                Text("最多第 \(stat.maxRound) 輪")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.graphiteWarning)
            }
            Text("有 \(stat.retryTestCount) 次 Test 需要重測 · 共多做 \(stat.totalRetryRounds) 輪")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 3)
    }
}

private struct TestRecordView: View {
    @ObservedObject var store: StudyStore
    let record: TestRecord
    var body: some View {
        List {
            Section("首輪結果") {
                LabeledContent("答對", value: "\(record.firstRound.known)")
                LabeledContent("答錯", value: "\(record.firstRound.unknown)")
                LabeledContent("收斂輪數", value: "\(record.roundCount)")
            }
            Section("各輪練習") {
                ForEach(record.rounds) { round in HStack { Text("第 \(round.round) 輪"); Spacer(); Text("會 \(round.known) · 不會 \(round.unknown)").foregroundStyle(.secondary) } }
            }
            Section("首輪作答") {
                ForEach(record.responses.filter { $0.round == 1 }) { response in
                    HStack {
                        Text(store.words.first(where: { $0.id == response.wordID })?.term ?? "已移除單字")
                        Spacer()
                        Text(response.known ? "會" : "不會")
                            .foregroundStyle(response.known ? Color.graphitePrimary : Color.graphiteMuted)
                    }
                }
            }
        }.navigationTitle(record.groupLabel ?? "Test 紀錄").navigationBarTitleDisplayMode(.inline)
    }
}

private struct SessionView: View {
    @ObservedObject var store: StudyStore
    let leaveSession: () -> Void
    var body: some View {
        Group {
            if let session = store.activeSession, let wordID = session.currentWordID, let word = store.words.first(where: { $0.id == wordID }) {
                GeometryReader { geometry in
                    ZStack {
                        VStack(spacing: 10) {
                            HStack {
                                Text(session.kind == .test ? "\(session.scopeLabel) · 第 \(session.round) 輪" : "初學 · 第 \(session.round) 輪")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                Spacer()
                                if let deadline = session.deadline {
                                    SessionCountdown(deadline: deadline) {
                                        store.finishTimedOutSession()
                                    }
                                }
                                Text("\(session.index + 1) / \(session.queue.count)")
                                    .font(.subheadline.monospacedDigit())
                                    .foregroundStyle(.secondary)
                            }
                            GeometryReader { geo in
                                ZStack(alignment: .leading) {
                                    Capsule().fill(Color.white.opacity(0.1)).frame(height: 3)
                                    Capsule().fill(Color.white.opacity(0.9))
                                        .frame(width: geo.size.width * CGFloat(session.index) / CGFloat(max(session.queue.count, 1)), height: 3)
                                }
                            }
                            .frame(height: 3)

                            Spacer(minLength: 0)
                        }

                        StudyCard(
                            word: word,
                            isFlipped: session.isFlipped,
                            exitDistance: geometry.size.width * 1.25
                        ) {
                            withAnimation(.easeInOut(duration: 0.18)) { store.toggleCard() }
                        } answer: { isKnown in
                            store.answer(isKnown: isKnown)
                        } undo: {
                            store.undoLastAnswer()
                        }
                    }
                }
                .padding()
                .padding(.horizontal, 8)
                .navigationTitle("練習").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("暫存並離開") { store.pauseActiveSession(); leaveSession() } } }
            } else if let completion = store.completion {
                CompletionView(completion: completion) { store.dismissCompletion(); leaveSession() }
            } else {
                ContentUnavailableView("這次練習不在這台裝置", systemImage: "arrow.triangle.2.circlepath", description: Text("請回到總覽選擇一組開始，或從網站繼續原本的練習。"))
            }
        }
    }
}

private struct SessionCountdown: View {
    let deadline: Date
    let onExpired: () -> Void
    @State private var expired = false

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let seconds = max(0, Int(ceil(deadline.timeIntervalSince(context.date))))
            Text(String(format: "%02d:%02d", seconds / 60, seconds % 60))
                .font(.subheadline.monospacedDigit().weight(.semibold))
                .foregroundStyle(seconds <= 60 ? Color.graphiteWarning : Color.graphiteText)
                .padding(.horizontal, 9)
                .padding(.vertical, 5)
                .background((seconds <= 60 ? Color.graphiteWarning : Color.graphitePrimary).opacity(0.14), in: Capsule())
                .accessibilityLabel("剩餘時間 \(seconds / 60) 分 \(seconds % 60) 秒")
                .onAppear { expireIfNeeded(seconds) }
                .onChange(of: seconds) { _, newValue in expireIfNeeded(newValue) }
        }
    }

    private func expireIfNeeded(_ seconds: Int) {
        guard seconds == 0, !expired else { return }
        expired = true
        onExpired()
    }
}

private struct StudyCard: View {
    let word: StudyWord
    let isFlipped: Bool
    let exitDistance: CGFloat
    let flip: () -> Void
    let answer: (Bool) -> Void
    let undo: () -> Void
    @State private var offset: CGSize = .zero
    @State private var rotation: Double = 0
    @State private var isSwipeTransitioning = false

    private let swipeThreshold: CGFloat = 90
    private let undoThreshold: CGFloat = 90
    private let swipeExitDuration = 0.18

    var body: some View {
        Group {
            if isFlipped {
                // Keep the complete definition in one Text view. SwiftUI then
                // wraps it as a single typographic block, so every Chinese
                // line on this card shares one font size.
                Text(word.meaning)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text(word.term)
                    .lineLimit(2)
                    .minimumScaleFactor(0.5)
            }
        }
            .font(isFlipped
                ? .custom("STSongti-TC-Regular", size: 34)
                : .system(size: 44, weight: .medium, design: .serif)
            )
            .tracking(isFlipped ? 6 : 0)
            .foregroundStyle(Color.white.opacity(0.92))
            .multilineTextAlignment(.center)
            .padding(.horizontal, 36)
            .frame(maxWidth: .infinity, minHeight: 220, alignment: .center)
            .offset(x: offset.width, y: offset.height)
            .rotationEffect(.degrees(rotation))
            .contentShape(Rectangle())
            .onTapGesture(perform: flip)
            .gesture(
                DragGesture(minimumDistance: 16)
                    .onChanged { value in
                        guard !isSwipeTransitioning else { return }
                        offset = value.translation
                        rotation = Double(value.translation.width / 22)
                    }
                    .onEnded { value in
                        guard !isSwipeTransitioning else { return }
                        let dx = value.translation.width
                        let dy = value.translation.height
                        let isVerticalDominant = abs(dy) > abs(dx)

                        if isVerticalDominant, dy < -undoThreshold {
                            isSwipeTransitioning = true
                            withAnimation(.easeOut(duration: swipeExitDuration)) {
                                offset = CGSize(width: offset.width, height: -500)
                            }
                            DispatchQueue.main.asyncAfter(deadline: .now() + swipeExitDuration) {
                                completeSwipe(undo)
                            }
                        } else if !isVerticalDominant, abs(dx) >= swipeThreshold {
                            isSwipeTransitioning = true
                            let direction: CGFloat = dx < 0 ? -1 : 1
                            withAnimation(.easeOut(duration: swipeExitDuration)) {
                                offset = CGSize(width: exitDistance * direction, height: 0)
                                rotation = Double(direction * 8)
                            }
                            DispatchQueue.main.asyncAfter(deadline: .now() + swipeExitDuration) {
                                completeSwipe { answer(dx < 0) }
                            }
                        } else {
                            withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                                offset = .zero
                                rotation = 0
                            }
                        }
                    }
            )
            .accessibilityLabel("點擊翻面查看答案，左右滑動判定熟悉度，上滑復原上一步")
    }

    private func completeSwipe(_ action: () -> Void) {
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            offset = .zero
            rotation = 0
            action()
            isSwipeTransitioning = false
        }
    }
}

private struct CompletionView: View {
    let completion: CompletionSummary
    let done: () -> Void

    var body: some View {
        VStack(spacing: 24) {
            Spacer(minLength: 36)
            Image(systemName: completion.timedOut ? "clock.badge.exclamationmark" : "checkmark.circle.fill")
                .font(.system(size: 52, weight: .medium))
                .foregroundStyle(completion.timedOut ? Color.graphiteWarning : Color.graphitePrimary)
            VStack(spacing: 8) {
                Text(completion.title).font(.title2.bold())
                Text(completion.timedOut
                     ? "未完成，不列入完成紀錄"
                     : completion.kind == .test ? "本輪測驗已完成" : "初始難度已儲存")
                    .font(.subheadline)
                    .foregroundStyle(Color.graphiteMuted)
            }

            HStack(spacing: 10) {
                CompletionMetric(title: completion.kind == .test ? "首輪答對" : "第一輪答對", value: completion.knownCount)
                CompletionMetric(title: completion.kind == .test ? "需要重測" : "需要複習", value: completion.unknownCount)
            }

            if completion.kind == .test {
                HStack(spacing: 7) {
                    Image(systemName: "arrow.triangle.2.circlepath")
                    Text("共 \(completion.roundCount) 輪，錯字已練到答對")
                }
                .font(.footnote.weight(.medium))
                .foregroundStyle(Color.graphiteMuted)
            }

            Text(completion.detail)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 10)

            Button("回到 Unit", action: done)
                .buttonStyle(.bordered)
                .tint(Color.graphitePrimary)
                .controlSize(.large)
            Spacer()
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.graphiteBlack)
    }
}

private struct CompletionMetric: View {
    let title: String
    let value: Int

    var body: some View {
        VStack(spacing: 6) {
            Text("\(value)")
                .font(.system(size: 30, weight: .semibold, design: .rounded))
            Text(title)
                .font(.caption)
                .foregroundStyle(Color.graphiteMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(Color.graphiteSurface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Color.graphiteBorder.opacity(0.7), lineWidth: 1))
    }
}

private struct SettingsView: View {
    @ObservedObject var store: StudyStore
    @Binding var isImporting: Bool
    @Environment(\.dismiss) private var dismiss
    @State private var isExporting = false
    var body: some View {
        NavigationStack {
            List {
                Section("資料") {
                    Button { isImporting = true; dismiss() } label: { Label("匯入 JSON 備份", systemImage: "square.and.arrow.down") }
                    Button { isExporting = true } label: { Label("匯出 JSON 備份", systemImage: "square.and.arrow.up") }
                }
                Section { Text("資料只保存在這台裝置。匯入會以新備份取代 App 內的資料。請在換裝置前先匯出。").font(.footnote).foregroundStyle(.secondary) }
            }
            .navigationTitle("資料管理")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("完成") { dismiss() } } }
            .fileExporter(isPresented: $isExporting, document: store.exportedBackup, contentType: .json, defaultFilename: "快速記憶法備份") { _ in }
        }
    }
}

private func masteryLabel(_ stage: Int) -> String {
    switch stage {
    case 5: "穩定"
    case 4: "熟悉"
    case 2...3: "學習中"
    case 1: "已初學"
    default: "尚未初學"
    }
}
