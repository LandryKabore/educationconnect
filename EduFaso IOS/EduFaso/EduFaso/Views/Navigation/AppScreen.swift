import SwiftUI

/// One destination for each screen in the web app sidebar (and the public pages that belong on iOS).
enum AppScreen: String, Identifiable, Hashable {
    case dashboard
    case profile
    case messages
    case announcements

    case adminSchools
    case adminUsers
    case adminInvites
    case adminReports
    case adminBilling
    case adminSettings
    case adminAudit
    case adminSuperAdmins

    case schoolConfig
    case schoolSettings
    case years
    case periods
    case subjects
    case classes
    case programmes
    case schoolTimetable
    case schoolAttendance
    case schoolHomework
    case schoolCompositions
    case teacherEntry
    case bulletins
    case schoolCahier
    case statistics
    case teachers
    case students
    case parents
    case signalements

    case teacherClasses
    case teacherStudents
    case teacherAttendance
    case timetable
    case teacherCahier
    case teacherEvaluations

    case cahier
    case grades
    case exercises
    case exams
    case compositions
    case attendance
    case myTeachers
    case bulletin

    case childNotes
    case childAttendance
    case childExams
    case childExercises
    case childCompositions
    case childBulletin
    case childTimetable
    case childCahier

    var id: String { rawValue }

    var title: String {
        switch self {
        case .dashboard: return "Tableau de bord"
        case .profile: return "Profil"
        case .messages: return "Messages"
        case .announcements: return "Annonces"
        case .adminSchools: return "Écoles"
        case .adminUsers: return "Utilisateurs"
        case .adminInvites: return "Invitations"
        case .adminReports: return "Rapports"
        case .adminBilling: return "Abonnements"
        case .adminSettings: return "Paramètres"
        case .adminAudit: return "Journal d'audit"
        case .adminSuperAdmins: return "Super admins"
        case .schoolConfig: return "Configuration"
        case .schoolSettings: return "Paramètres école"
        case .years: return "Années scolaires"
        case .periods: return "Périodes et clôture"
        case .subjects: return "Matières"
        case .classes: return "Classes"
        case .programmes: return "Programmes"
        case .schoolTimetable: return "Emplois du temps"
        case .schoolAttendance: return "Présences"
        case .schoolHomework: return "Devoirs"
        case .schoolCompositions: return "Compositions"
        case .teacherEntry: return "Saisie enseignant"
        case .bulletins: return "Bulletins"
        case .schoolCahier: return "Cahier de textes"
        case .statistics: return "Statistiques"
        case .teachers: return "Enseignants"
        case .students: return "Élèves"
        case .parents: return "Parents"
        case .signalements: return "Signalements"
        case .teacherClasses: return "Classes"
        case .teacherStudents: return "Élèves"
        case .teacherAttendance: return "Présences"
        case .timetable: return "Mon emploi du temps"
        case .teacherCahier: return "Cahier de textes"
        case .teacherEvaluations: return "Devoirs & évaluations"
        case .cahier: return "Cahier de textes"
        case .grades: return "Mes notes"
        case .exercises: return "Exercices de maison"
        case .exams: return "Devoirs"
        case .compositions: return "Compositions"
        case .attendance: return "Mes présences"
        case .myTeachers: return "Mes profs"
        case .bulletin: return "Mon bulletin"
        case .childNotes: return "Notes"
        case .childAttendance: return "Présences"
        case .childExams: return "Devoirs"
        case .childExercises: return "Exercices de maison"
        case .childCompositions: return "Compositions"
        case .childBulletin: return "Bulletins"
        case .childTimetable: return "Emploi du temps"
        case .childCahier: return "Cahier de textes"
        }
    }

    var systemImage: String {
        switch self {
        case .dashboard: return "square.grid.2x2"
        case .profile: return "person.crop.circle"
        case .messages: return "envelope"
        case .announcements: return "megaphone"
        case .adminSchools, .schoolSettings: return "building.2"
        case .adminUsers, .adminSuperAdmins, .teachers, .myTeachers, .teacherStudents, .students: return "person.2"
        case .adminInvites: return "envelope.badge"
        case .adminReports, .statistics, .bulletins, .childBulletin, .bulletin: return "chart.bar.doc.horizontal"
        case .adminBilling: return "creditcard"
        case .adminSettings, .schoolConfig: return "gearshape"
        case .adminAudit: return "list.clipboard"
        case .years, .periods, .timetable, .schoolTimetable, .childTimetable: return "calendar"
        case .subjects, .cahier, .schoolCahier, .teacherCahier, .childCahier, .grades, .childNotes: return "book"
        case .classes, .teacherClasses: return "rectangle.3.group"
        case .programmes: return "square.stack.3d.up"
        case .schoolAttendance, .teacherAttendance, .attendance, .childAttendance: return "checklist"
        case .schoolHomework, .teacherEvaluations, .exams, .exercises, .childExams, .childExercises: return "doc.text"
        case .schoolCompositions, .compositions, .childCompositions: return "text.book.closed"
        case .teacherEntry: return "pencil.line"
        case .parents: return "figure.and.child.holdinghands"
        case .signalements: return "exclamationmark.bubble"
        }
    }

    static func home(for role: AppRole?) -> AppScreen {
        .dashboard
    }
}

struct AppNavSection: Identifiable {
    let id: String
    var title: String?
    let screens: [AppScreen]
}

func menuTitle(_ screen: AppScreen, role: AppRole?) -> String {
    if screen == .dashboard {
        if role == .parent { return "Accueil" }
        if role == .schoolAdmin { return "Mon école" }
    }
    return screen.title
}

func appNavSections(for role: AppRole?) -> [AppNavSection] {
    let account = AppNavSection(id: "compte", title: "Compte", screens: [.profile])
    switch role {
    case .superAdmin:
        return [
            AppNavSection(id: "main", title: nil, screens: [
                .dashboard, .adminSchools, .adminUsers, .adminInvites, .adminReports,
                .signalements, .adminBilling, .adminSettings, .adminAudit, .adminSuperAdmins,
            ]),
            account,
        ]
    case .schoolAdmin:
        return [
            AppNavSection(id: "ecole", title: nil, screens: [.dashboard, .schoolConfig]),
            AppNavSection(id: "vie", title: "Vie scolaire", screens: [
                .schoolTimetable, .schoolAttendance, .schoolHomework, .schoolCompositions,
                .teacherEntry, .bulletins, .schoolCahier, .statistics,
            ]),
            AppNavSection(id: "personnes", title: "Personnes", screens: [.teachers, .students, .parents]),
            AppNavSection(id: "structure", title: "Structure", screens: [
                .schoolSettings, .years, .periods, .signalements, .subjects, .classes, .programmes,
            ]),
            AppNavSection(id: "com", title: "Communication", screens: [.messages, .announcements]),
            account,
        ]
    case .teacher:
        return [
            AppNavSection(id: "main", title: nil, screens: [.dashboard]),
            AppNavSection(id: "ens", title: "Enseignement", screens: [
                .teacherClasses, .teacherStudents, .teacherAttendance, .timetable, .teacherCahier, .teacherEvaluations,
            ]),
            AppNavSection(id: "com", title: "Communication", screens: [.messages, .announcements]),
            account,
        ]
    case .student:
        return [
            AppNavSection(id: "main", title: nil, screens: [.dashboard]),
            AppNavSection(id: "scolarite", title: "Scolarité", screens: [
                .grades, .bulletin, .attendance, .timetable, .myTeachers,
            ]),
            AppNavSection(id: "travaux", title: "Travaux & cahier", screens: [
                .cahier, .exercises, .exams, .compositions,
            ]),
            AppNavSection(id: "com", title: "Communication", screens: [.messages, .announcements]),
            account,
        ]
    case .parent:
        return [
            AppNavSection(id: "main", title: nil, screens: [.dashboard]),
            AppNavSection(id: "enfants", title: "Mes enfants", screens: [
                .childNotes, .childAttendance, .childExams, .childExercises,
                .childCompositions, .childBulletin, .childTimetable, .childCahier,
            ]),
            AppNavSection(id: "com", title: "Communication", screens: [.messages, .announcements]),
            account,
        ]
    case .none:
        return [account]
    }
}
