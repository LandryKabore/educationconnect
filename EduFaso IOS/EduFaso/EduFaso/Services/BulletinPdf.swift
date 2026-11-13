import UIKit
import CoreImage
import CoreImage.CIFilterBuiltins

/// Official A4 bulletin — layout aligned with web `src/lib/pdfBulletin.ts`.
enum BulletinPdf {
    struct StudentInfo {
        var firstName: String?
        var lastName: String?
        var dateOfBirth: String?
        var gender: String?
        var matricule: String?
    }

    struct SchoolInfo {
        var name: String
        var city: String?
        var address: String?
        var phone: String?
        var email: String?
    }

    struct Input {
        var school: SchoolInfo
        var student: StudentInfo
        var className: String
        var periodLabel: String
        var stats: BulletinClassStats
        var annual: AnnualAverageResult?
        var verificationCode: String?
        var verificationURL: String?
        var logo: UIImage?
    }

    private static let pageW: CGFloat = 210
    private static let pageH: CGFloat = 297
    private static let margin: CGFloat = 9.5
    private static let contentW: CGFloat = pageW - 2 * margin
    private static let signTop: CGFloat = 256
    private static let footerY: CGFloat = 289.5
    private static let passing: Double = 10

    private static let ink = UIColor(red: 15 / 255, green: 23 / 255, blue: 42 / 255, alpha: 1)
    private static let slate = UIColor(red: 51 / 255, green: 65 / 255, blue: 85 / 255, alpha: 1)
    private static let muted = UIColor(red: 100 / 255, green: 116 / 255, blue: 139 / 255, alpha: 1)
    private static let rule = UIColor(red: 203 / 255, green: 213 / 255, blue: 225 / 255, alpha: 1)
    private static let teal = UIColor(red: 15 / 255, green: 118 / 255, blue: 110 / 255, alpha: 1)
    private static let altRow = UIColor(red: 248 / 255, green: 250 / 255, blue: 252 / 255, alpha: 1)
    private static let footFill = UIColor(red: 241 / 255, green: 245 / 255, blue: 249 / 255, alpha: 1)

    static func make(_ input: Input) -> Data {
        let bounds = CGRect(x: 0, y: 0, width: mm(pageW), height: mm(pageH))
        let renderer = UIGraphicsPDFRenderer(bounds: bounds)
        return renderer.pdfData { ctx in
            ctx.beginPage()
            drawPage(input: input)
        }
    }

    // MARK: - Draw

    private static func drawPage(input: Input) {
        let subjects = input.stats.subjects ?? []
        let isAnnual = input.periodLabel == "Année" || input.stats.isAnnual == true
        let className = input.stats.className ?? input.className
        let yearLabel = input.stats.yearLabel
        let general = input.stats.general
        let generalAvg = general?.studentAvg ?? input.annual?.annualAverage
        let mention = bulletinMention(generalAvg)
        let totals = bulletinTotals(subjects)

        // —— Header ——
        spaced("BURKINA FASO", x: margin, y: 11, size: 8.3, weight: .bold, color: ink, tracking: 0.35)
        text("La Patrie ou la Mort, Nous Vaincrons", x: margin, y: 14.6, size: 7.1, weight: .regular, color: UIColor(red: 30 / 255, green: 41 / 255, blue: 59 / 255, alpha: 1), italic: true)

        let ministry = [
            "MINISTÈRE DE L’ÉDUCATION NATIONALE,",
            "DE L’ALPHABÉTISATION ET DE LA PROMOTION",
            "DES LANGUES NATIONALES",
        ]
        for (i, line) in ministry.enumerated() {
            spaced(line, x: pageW - margin, y: 11 + CGFloat(i) * 3.1, size: 6.7, weight: .bold, color: ink, tracking: 0.12, align: .right)
        }

        if let logo = input.logo ?? UIImage(named: "EduFasoLogo") {
            let box: CGFloat = 15
            let ratio = logo.size.width / max(logo.size.height, 1)
            let w = ratio >= 1 ? box : box * ratio
            let h = ratio >= 1 ? box / ratio : box
            logo.draw(in: CGRect(x: mm(pageW / 2 - w / 2), y: mm(10 + (box - h) / 2), width: mm(w), height: mm(h)))
        }

        stroke(x1: margin, y1: 29.8, x2: pageW - margin, y2: 29.8, color: ink, width: 0.7)
        stroke(x1: margin, y1: 31.2, x2: pageW - margin, y2: 31.2, color: ink, width: 0.25)

        spaced((input.school.name.isEmpty ? "École" : input.school.name).uppercased(),
               x: pageW / 2, y: 38, size: 11.2, weight: .bold, color: ink, tracking: 0.35, align: .center)

        let place = [input.school.address, input.school.city].compactMap { $0?.nilIfEmpty }.joined(separator: ", ")
        var coords: [String] = []
        if !place.isEmpty { coords.append(place) }
        if let phone = input.school.phone?.nilIfEmpty { coords.append("Tél. \(phone)") }
        if let email = input.school.email?.nilIfEmpty { coords.append(email) }
        if !coords.isEmpty {
            text(coords.joined(separator: "  ·  "), x: pageW / 2, y: 42, size: 7.4, weight: .regular, color: slate, align: .center)
        }

        // Title with superscript
        let title = bulletinTitleParts(input.periodLabel)
        drawTitle(title, y: 49.4)
        if let yearLabel, !yearLabel.isEmpty {
            text("Année scolaire \(yearLabel)", x: pageW / 2, y: 53.6, size: 8.2, weight: .regular, color: slate, align: .center)
        }
        stroke(x1: margin + 21, y1: 56.6, x2: pageW - margin - 21, y2: 56.6, color: teal, width: 0.8)

        // —— Identity ——
        let lastName = (input.student.lastName ?? "").uppercased()
        let firstName = input.student.firstName.map(capitalizeName) ?? ""
        var fields: [(String, String)] = [
            ("ÉLÈVE", [lastName, firstName].filter { !$0.isEmpty }.joined(separator: " ").nilIfEmpty ?? "—")
        ]
        if let dob = frenchDate(input.student.dateOfBirth) { fields.append(("NÉ(E) LE", dob)) }
        if let sex = genderLabel(input.student.gender) { fields.append(("SEXE", sex)) }
        if let mat = input.student.matricule?.nilIfEmpty { fields.append(("MATRICULE", mat)) }
        fields.append(("CLASSE", className.isEmpty ? "—" : className))
        if let size = input.stats.classSize, size > 0 {
            fields.append(("EFFECTIF", "\(size) élève\(size > 1 ? "s" : "")"))
        }

        let idTop: CGFloat = 60.2
        let idRows = Int(ceil(Double(fields.count) / 3.0))
        let idRowH: CGFloat = 7.4
        let idH = 5.4 + CGFloat(idRows) * idRowH
        strokeRect(x: margin, y: idTop, w: contentW, h: idH, color: ink, width: 0.4)

        let colX: [CGFloat] = [margin + 3.5, margin + 68, margin + 152]
        for (i, field) in fields.enumerated() {
            let x = colX[i % 3]
            let yy = idTop + 5 + CGFloat(i / 3) * idRowH
            spaced(field.0, x: x, y: yy, size: 6.4, weight: .regular, color: slate, tracking: 0.15)
            let maxW = (i % 3 == 2 ? pageW - margin - 2 : colX[(i % 3) + 1] - 3) - x
            text(truncate(field.1, maxWidth: mm(maxW), font: helvetica(8.3, .bold)),
                 x: x, y: yy + 3.6, size: 8.3, weight: .bold, color: ink)
        }

        // —— Table ——
        let tableTop = max(84, idTop + idH + 3.3)
        let annualRows = isAnnual && !(input.annual?.trimesters?.isEmpty ?? true)
        let summaryH: CGFloat = annualRows ? 26.5 : 23
        let conseil = conseilSentence(
            average: generalAvg,
            subjects: subjects,
            isAnnual: isAnnual,
            annual: input.annual
        )
        let conseilLines = wrap(conseil, width: contentW - 2, font: helvetica(8.6, .regular))
        let conseilH = 8.5 + CGFloat(conseilLines.count) * 3.9
        let headH: CGFloat = 6.6
        let totalsH: CGFloat = 6.6
        let gapAfterTable: CGFloat = 4.5
        let gapBeforeSigns: CGFloat = 5
        let n = max(1, subjects.count)
        let avail = signTop - gapBeforeSigns - conseilH - summaryH - gapAfterTable - tableTop - headH - totalsH - 2
        let hasTeachers = subjects.contains { !($0.teacherName?.isEmpty ?? true) }
        let rowH = min(10, max(hasTeachers ? 6.5 : 5.6, avail / CGFloat(n)))

        let colWidths: [CGFloat] = [53.5, 14.5, 21.7, 21.1, 21.1, 22.6, contentW - (53.5 + 14.5 + 21.7 + 21.1 + 21.1 + 22.6)]
        let headers = ["Matières", "Coef.", "Moy. /20", "Total", "Rang", "Moy. cl.", "Appréciation"]

        // header
        fillRect(x: margin, y: tableTop, w: contentW, h: headH, color: teal)
        var x = margin
        for (i, h) in headers.enumerated() {
            text(h, x: x + colWidths[i] / 2, y: tableTop + headH / 2 + 1.1, size: 7.1, weight: .bold, color: .white, align: .center)
            x += colWidths[i]
        }
        // grid outer
        strokeRect(x: margin, y: tableTop, w: contentW, h: headH + rowH * CGFloat(max(subjects.count, 1)) + totalsH, color: ink, width: 0.25)

        let bodyTop = tableTop + headH
        if subjects.isEmpty {
            fillRect(x: margin, y: bodyTop, w: contentW, h: rowH, color: .white)
            text("Aucune moyenne pour cette période", x: margin + 1.6, y: bodyTop + rowH / 2 + 1, size: 7.9, weight: .regular, color: ink)
            stroke(x1: margin, y1: bodyTop + rowH, x2: pageW - margin, y2: bodyTop + rowH, color: ink, width: 0.25)
        } else {
            for (idx, s) in subjects.enumerated() {
                let y = bodyTop + CGFloat(idx) * rowH
                if idx % 2 == 1 {
                    fillRect(x: margin, y: y, w: contentW, h: rowH, color: altRow)
                }
                let avg = s.studentAvg
                let coef = s.coefficient ?? 0
                let total = avg.map { $0 * coef }
                let cells: [String] = [
                    "",
                    fmtFr(coef).replacingOccurrences(of: ".", with: ","),
                    fmtFr(avg),
                    fmtFr(total),
                    "",
                    fmtFr(s.classAvg),
                    subjectAppreciation(avg),
                ]
                var cx = margin
                let midY = y + rowH / 2
                for (i, cell) in cells.enumerated() {
                    if i == 0 {
                        let name = s.subjectName ?? "—"
                        if let teacher = s.teacherName?.nilIfEmpty {
                            text(truncate(name, maxWidth: mm(colWidths[0] - 3.2), font: helvetica(7.9, .bold)),
                                 x: cx + 1.6, y: midY - 0.1, size: 7.9, weight: .bold, color: ink)
                            text(truncate(teacher, maxWidth: mm(colWidths[0] - 3.2), font: helvetica(6.3, .regular)),
                                 x: cx + 1.6, y: midY + 2.9, size: 6.3, weight: .regular, color: slate)
                        } else {
                            text(truncate(name, maxWidth: mm(colWidths[0] - 3.2), font: helvetica(7.9, .bold)),
                                 x: cx + 1.6, y: midY + 1, size: 7.9, weight: .bold, color: ink)
                        }
                    } else if i == 4 {
                        if let rank = s.rank, rank > 0 {
                            drawRank(rank: rank, count: s.rankedCount, x: cx + colWidths[i] / 2, y: midY + 1, size: 7.9)
                        } else {
                            text("—", x: cx + colWidths[i] / 2, y: midY + 1, size: 7.9, weight: .regular, color: ink, align: .center)
                        }
                    } else if i == 6 {
                        text(cell, x: cx + 1.6, y: midY + 1, size: 7.5, weight: .regular, color: ink, align: .left)
                    } else {
                        let weight: UIFont.Weight = (i == 2 && (avg ?? 99) < passing) ? .bold : .regular
                        text(cell, x: cx + colWidths[i] / 2, y: midY + 1, size: 7.9, weight: weight, color: ink, align: .center)
                    }
                    // vertical grid
                    stroke(x1: cx, y1: y, x2: cx, y2: y + rowH, color: ink, width: 0.25)
                    cx += colWidths[i]
                }
                stroke(x1: pageW - margin, y1: y, x2: pageW - margin, y2: y + rowH, color: ink, width: 0.25)
                stroke(x1: margin, y1: y + rowH, x2: pageW - margin, y2: y + rowH, color: ink, width: 0.25)
            }
        }

        let footY = bodyTop + rowH * CGFloat(max(subjects.count, 1))
        fillRect(x: margin, y: footY, w: contentW, h: totalsH, color: footFill)
        stroke(x1: margin, y1: footY, x2: pageW - margin, y2: footY, color: ink, width: 0.55)

        let generalFromTotals = totals.average
        let shownGeneral = generalAvg ?? generalFromTotals
        let totalsLabel: String = {
            if subjects.isEmpty { return "Moyenne générale : —" }
            if let g = generalFromTotals, let s = shownGeneral, abs(g - s) < 0.006 {
                return "Moyenne générale = \(fmtFr(totals.total)) ÷ \(fmtFr(totals.coef).replacingOccurrences(of: ".", with: ",")) = \(fmtFr(s)) / 20"
            }
            return "Moyenne générale = \(fmtFr(shownGeneral)) / 20"
        }()

        text("Totaux", x: margin + 1.6, y: footY + totalsH / 2 + 1, size: 7.9, weight: .bold, color: ink)
        text(subjects.isEmpty ? "—" : fmtFr(totals.coef).replacingOccurrences(of: ".", with: ","),
             x: margin + colWidths[0] + colWidths[1] / 2, y: footY + totalsH / 2 + 1, size: 7.9, weight: .bold, color: ink, align: .center)
        text(subjects.isEmpty ? "—" : fmtFr(totals.total),
             x: margin + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] / 2,
             y: footY + totalsH / 2 + 1, size: 7.9, weight: .bold, color: ink, align: .center)
        text(totalsLabel,
             x: margin + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 1.6,
             y: footY + totalsH / 2 + 1, size: 7.9, weight: .bold, color: ink)

        var y = footY + totalsH + gapAfterTable
        if y + summaryH + conseilH + gapBeforeSigns > signTop + 1 {
            // keep on one page by tightening — clamp into remaining space
            y = min(y, signTop - summaryH - conseilH - gapBeforeSigns)
        }

        // —— Summary ——
        stroke(x1: margin, y1: y, x2: pageW - margin, y2: y, color: teal, width: 0.55)
        let colW: [CGFloat] = [contentW * 0.36, contentW * 0.3, contentW * 0.34]
        let cx: [CGFloat] = [margin + 0.5, margin + colW[0] + 3.5, margin + colW[0] + colW[1] + 3.5]
        stroke(x1: cx[1] - 3.5, y1: y + 3.5, x2: cx[1] - 3.5, y2: y + summaryH - 1, color: rule, width: 0.25)
        stroke(x1: cx[2] - 3.5, y1: y + 3.5, x2: cx[2] - 3.5, y2: y + summaryH - 1, color: rule, width: 0.25)

        let kY = y + 5.4
        spaced(isAnnual ? "MOYENNE ANNUELLE" : "MOYENNE GÉNÉRALE", x: cx[0], y: kY, size: 6.4, weight: .regular, color: slate, tracking: 0.3)
        let big = fmtFr(shownGeneral)
        text(big, x: cx[0], y: kY + 8.9, size: 21, weight: .bold, color: ink)
        let bigW = (big as NSString).size(withAttributes: [.font: helvetica(21, .bold)]).width / (72 / 25.4)
        text("/ 20", x: cx[0] + bigW + 1.5, y: kY + 8.9, size: 9.7, weight: .regular, color: slate)
        if let general {
            let ecart = (general.studentAvg != nil && general.classAvg != nil)
                ? (general.studentAvg! - general.classAvg!)
                : nil
            text("Classe : \(fmtFr(general.classAvg)) / 20 · Écart : \(fmtEcartFr(ecart))",
                 x: cx[0], y: kY + 13.4, size: 8.2, weight: .regular, color: ink)
        }
        if annualRows, let annual = input.annual {
            let tri = (annual.trimesters ?? []).map { t in
                let label = (t.periodLabel ?? "").replacingOccurrences(of: "Trimestre ", with: "T")
                return "\(label) : \(fmtFr(t.generalAverage))"
            }.joined(separator: " · ")
            text(tri, x: cx[0], y: kY + (general != nil ? 17.4 : 13.4), size: 7.2, weight: .regular, color: slate)
        }

        spaced("MENTION", x: cx[1], y: kY, size: 6.4, weight: .regular, color: slate, tracking: 0.3)
        text(mention, x: cx[1], y: kY + 5.6, size: 12, weight: .bold, color: ink)
        if let rank = general?.rank, rank > 0 {
            text("Rang : ", x: cx[1], y: kY + 10.4, size: 8.2, weight: .regular, color: ink)
            let lw = ("Rang : " as NSString).size(withAttributes: [.font: helvetica(8.2, .regular)]).width / (72 / 25.4)
            drawRank(rank: rank, count: general?.rankedCount, x: cx[1] + lw, y: kY + 10.4, size: 8.2, align: .left)
        }
        if isAnnual, let annual = input.annual, annual.passed != nil {
            let d: String
            if annual.complete == true {
                d = annual.passed == true ? "Décision : Admis(e)" : "Décision : Ajourné(e)"
            } else {
                d = "Décision : provisoire"
            }
            text(d, x: cx[1], y: kY + 14.6, size: 8.2, weight: .bold, color: ink)
        }

        spaced(isAnnual ? "ASSIDUITÉ (ANNÉE)" : "ASSIDUITÉ (PÉRIODE)", x: cx[2], y: kY, size: 6.4, weight: .regular, color: slate, tracking: 0.3)
        let nAbs = input.stats.attendance?.absences ?? 0
        let nLate = input.stats.attendance?.lates ?? 0
        drawAssiduite(count: nAbs, text: absencesText(nAbs), x: cx[2], y: kY + 5)
        drawAssiduite(count: nLate, text: latesText(nLate), x: cx[2], y: kY + 9)

        y += summaryH

        // —— Conseil ——
        stroke(x1: margin, y1: y, x2: pageW - margin, y2: y, color: rule, width: 0.25)
        spaced("APPRÉCIATION DU CONSEIL DE CLASSE", x: margin + 0.5, y: y + 4.4, size: 6.4, weight: .regular, color: slate, tracking: 0.3)
        var cy = y + 8.9
        for line in conseilLines {
            text(line, x: margin + 0.5, y: cy, size: 8.6, weight: .regular, color: ink)
            cy += 3.9
        }

        // —— QR + signature ——
        stroke(x1: margin, y1: signTop, x2: pageW - margin, y2: signTop, color: rule, width: 0.25)

        if let code = input.verificationCode, let url = input.verificationURL, let qr = qrImage(from: url) {
            let size: CGFloat = 18.5
            let qy: CGFloat = 265.3
            qr.draw(in: CGRect(x: mm(margin), y: mm(qy), width: mm(size), height: mm(size)))
            let tx = margin + size + 2.5
            spaced("AUTHENTICITÉ", x: tx, y: qy + 6.8, size: 6.7, weight: .bold, color: ink, tracking: 0.2)
            text("Scannez le QR ou saisissez le code :", x: tx, y: qy + 9.9, size: 6, weight: .regular, color: UIColor(red: 30 / 255, green: 41 / 255, blue: 59 / 255, alpha: 1))
            text(code, x: tx, y: qy + 12.8, size: 6, weight: .bold, color: ink)
            let host = url
                .replacingOccurrences(of: "https://", with: "")
                .replacingOccurrences(of: "http://", with: "")
                .components(separatedBy: "?").first ?? url
            text(host, x: tx, y: qy + 15.6, size: 6, weight: .regular, color: muted)
        }

        let sigL = pageW - margin - 68
        let sigC = sigL + 34
        spaced("LE CHEF D’ÉTABLISSEMENT", x: sigC, y: 261.4, size: 6.4, weight: .regular, color: slate, tracking: 0.25, align: .center)
        stroke(x1: sigL, y1: 281.3, x2: pageW - margin, y2: 281.3, color: UIColor(red: 148 / 255, green: 163 / 255, blue: 184 / 255, alpha: 1), width: 0.25)
        text("Signature et cachet", x: sigC, y: 284, size: 6, weight: .regular, color: muted, align: .center)

        // Footer
        let when = frenchToday()
        text("Généré le \(when) — EduFaso", x: margin, y: footerY, size: 6.4, weight: .regular, color: UIColor(red: 71 / 255, green: 85 / 255, blue: 105 / 255, alpha: 1))
        text("Page 1 / 1", x: pageW - margin, y: footerY, size: 6.4, weight: .regular, color: UIColor(red: 71 / 255, green: 85 / 255, blue: 105 / 255, alpha: 1), align: .right)
    }

    // MARK: - Helpers (format)

    private static func fmtFr(_ n: Double?, digits: Int = 2) -> String {
        guard let n, !n.isNaN else { return "—" }
        return String(format: "%.\(digits)f", n).replacingOccurrences(of: ".", with: ",")
    }

    private static func fmtEcartFr(_ n: Double?) -> String {
        guard let n, !n.isNaN else { return "—" }
        let sign = n > 0 ? "+" : (n < 0 ? "−" : "")
        return "\(sign)\(String(format: "%.2f", abs(n)).replacingOccurrences(of: ".", with: ","))"
    }

    private static func bulletinMention(_ avg: Double?) -> String {
        guard let avg, !avg.isNaN else { return "—" }
        if avg >= 16 { return "Félicitations" }
        if avg >= 14 { return "Encouragements" }
        if avg >= 12 { return "Compliments" }
        if avg >= passing { return "Passable" }
        return "Insuffisant"
    }

    private static func subjectAppreciation(_ avg: Double?) -> String {
        guard let avg, !avg.isNaN else { return "—" }
        if avg >= 16 { return "Très bien" }
        if avg >= 14 { return "Bien" }
        if avg >= 12 { return "Assez bien" }
        if avg >= 10 { return "Passable" }
        if avg >= 8 { return "Insuffisant" }
        return "Faible"
    }

    private static func bulletinTitleParts(_ period: String) -> (before: String, sup: String, after: String) {
        if period == "Année" { return ("Bulletin de notes annuel", "", "") }
        if period.hasPrefix("Trimestre "),
           let n = Int(period.replacingOccurrences(of: "Trimestre ", with: "")),
           (1...3).contains(n) {
            return ("Bulletin de notes du \(n)", n == 1 ? "er" : "e", " trimestre")
        }
        return ("Bulletin de notes — \(period)", "", "")
    }

    private static func genderLabel(_ g: String?) -> String? {
        guard let g, !g.isEmpty else { return nil }
        let v = g.trimmingCharacters(in: .whitespaces).uppercased()
        if v.hasPrefix("F") { return "F" }
        if v.hasPrefix("M") || v.hasPrefix("G") || v == "H" { return "M" }
        return nil
    }

    private static func frenchDate(_ iso: String?) -> String? {
        guard let iso, let m = iso.range(of: #"^(\d{4})-(\d{2})-(\d{2})"#, options: .regularExpression) else { return nil }
        let parts = iso[m].split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        let months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
        guard parts[1] >= 1, parts[1] <= 12 else { return nil }
        return "\(parts[2]) \(months[parts[1] - 1]) \(parts[0])"
    }

    private static func frenchToday(_ d: Date = Date()) -> String {
        let cal = Calendar.current
        let months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
        return "\(cal.component(.day, from: d)) \(months[cal.component(.month, from: d) - 1]) \(cal.component(.year, from: d))"
    }

    private static func absencesText(_ n: Int) -> String {
        n == 0 ? "Aucune absence non justifiée" : "\(n) jour\(n > 1 ? "s" : "") d’absence non justifiée"
    }

    private static func latesText(_ n: Int) -> String {
        n == 0 ? "Aucun retard" : "\(n) jour\(n > 1 ? "s" : "") de retard"
    }

    private static func bulletinTotals(_ subjects: [BulletinSubjectStat]) -> (coef: Double, total: Double, average: Double?) {
        var coef = 0.0
        var total = 0.0
        for s in subjects {
            let c = s.coefficient ?? 0
            guard let a = s.studentAvg, !a.isNaN else { continue }
            coef += c
            total += a * c
        }
        return (coef, total, coef > 0 ? total / coef : nil)
    }

    private static func conseilSentence(average: Double?, subjects: [BulletinSubjectStat], isAnnual: Bool, annual: AnnualAverageResult?) -> String {
        let weak = subjects
            .filter { s in
                guard let a = s.studentAvg else { return false }
                let classAvg = s.classAvg ?? a
                return a < 12 || a < classAvg
            }
            .sorted { ($0.studentAvg ?? 99) < ($1.studentAvg ?? 99) }
            .prefix(2)
            .map { subjectForSentence($0.subjectName ?? "") }
        let focus = weak.isEmpty ? "" : ", en particulier en \(weak.joined(separator: " et en "))"
        func lead(_ tri: String, _ year: String) -> String { isAnnual ? year : tri }

        var text: String
        if let average, !average.isNaN {
            if average >= 16 {
                text = "\(lead("Excellent trimestre", "Excellents résultats sur l’année")). Le conseil de classe adresse ses félicitations à l’élève."
            } else if average >= 14 {
                text = "\(lead("Très bon trimestre", "Très bons résultats sur l’année")). Le conseil de classe adresse ses encouragements à l’élève et l’invite à maintenir ses efforts\(focus)."
            } else if average >= 12 {
                text = "\(lead("Bon trimestre", "Bons résultats sur l’année")). Le conseil de classe adresse ses compliments à l’élève et l’invite à poursuivre ses efforts\(focus)."
            } else if average >= passing {
                text = "\(lead("Trimestre passable", "Résultats passables sur l’année")). Le conseil de classe invite l’élève à fournir davantage d’efforts\(focus)."
            } else {
                text = "\(lead("Trimestre insuffisant", "Résultats insuffisants sur l’année")). Le conseil de classe demande à l’élève un travail plus régulier et plus soutenu\(focus)."
            }
        } else {
            text = "Moyenne générale non disponible pour cette période."
        }

        if isAnnual, let annual, annual.passed != nil, annual.annualAverage != nil {
            let decision: String
            if annual.complete == true {
                decision = annual.passed == true ? "Admis" : "Ajourné"
            } else {
                decision = annual.passed == true ? "En cours (≥ 10)" : "En cours (< 10)"
            }
            text += " Décision : \(decision)\(annual.complete == true ? "" : " (provisoire)")."
        }
        return text
    }

    private static func subjectForSentence(_ name: String) -> String {
        name.split(whereSeparator: { $0 == " " || $0 == "-" })
            .map { part -> String in
                let s = String(part)
                if s.count > 1 && s == s.uppercased() { return s }
                return s.lowercased()
            }
            .joined(separator: " ")
            .replacingOccurrences(of: " - ", with: "-")
    }

    private static func capitalizeName(_ s: String) -> String {
        s.lowercased().capitalized(with: Locale(identifier: "fr_FR"))
    }

    // MARK: - Drawing primitives
    // Coordinates are mm (like jsPDF). Font sizes are points (like jsPDF setFontSize).

    private static func mm(_ v: CGFloat) -> CGFloat { v * 72 / 25.4 }

    private static func helvetica(_ sizePt: CGFloat, _ weight: UIFont.Weight) -> UIFont {
        let name: String
        switch weight {
        case .bold, .semibold, .heavy, .black: name = "Helvetica-Bold"
        default: name = "Helvetica"
        }
        return UIFont(name: name, size: sizePt) ?? .systemFont(ofSize: sizePt, weight: weight)
    }

    /// Draw text with baseline at (x mm, y mm), matching jsPDF.
    private static func drawString(
        _ string: String,
        atX ptX: CGFloat,
        baselineYMm y: CGFloat,
        font: UIFont,
        color: UIColor,
        kern: CGFloat = 0
    ) {
        var attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
        if kern != 0 { attrs[.kern] = kern }
        (string as NSString).draw(at: CGPoint(x: ptX, y: mm(y) - font.ascender), withAttributes: attrs)
    }

    private static func textWidth(_ string: String, font: UIFont, kern: CGFloat = 0) -> CGFloat {
        var attrs: [NSAttributedString.Key: Any] = [.font: font]
        if kern != 0 { attrs[.kern] = kern }
        return (string as NSString).size(withAttributes: attrs).width
    }

    private static func alignedX(_ xMm: CGFloat, widthPt: CGFloat, align: NSTextAlignment) -> CGFloat {
        switch align {
        case .center: return mm(xMm) - widthPt / 2
        case .right: return mm(xMm) - widthPt
        default: return mm(xMm)
        }
    }

    private static func text(
        _ string: String,
        x: CGFloat,
        y: CGFloat,
        size: CGFloat,
        weight: UIFont.Weight,
        color: UIColor,
        align: NSTextAlignment = .left,
        italic: Bool = false
    ) {
        let font: UIFont
        if italic {
            font = UIFont(name: "Helvetica-Oblique", size: size)
                ?? UIFont.italicSystemFont(ofSize: size)
        } else {
            font = helvetica(size, weight)
        }
        let w = textWidth(string, font: font)
        drawString(string, atX: alignedX(x, widthPt: w, align: align), baselineYMm: y, font: font, color: color)
    }

    private static func spaced(
        _ string: String,
        x: CGFloat,
        y: CGFloat,
        size: CGFloat,
        weight: UIFont.Weight,
        color: UIColor,
        tracking: CGFloat,
        align: NSTextAlignment = .left
    ) {
        let font = helvetica(size, weight)
        let kern = mm(tracking)
        let w = textWidth(string, font: font, kern: kern)
        drawString(string, atX: alignedX(x, widthPt: w, align: align), baselineYMm: y, font: font, color: color, kern: kern)
    }

    private static func drawTitle(_ t: (before: String, sup: String, after: String), y: CGFloat) {
        let size: CGFloat = 12
        let cs = mm(0.45)
        let before = t.before.uppercased()
        let after = t.after.uppercased()
        let font = helvetica(size, .bold)
        let supFont = helvetica(size * 0.62, .bold)
        let wB = textWidth(before, font: font, kern: cs)
        let wA = textWidth(after, font: font, kern: cs)
        let wS = t.sup.isEmpty ? 0 : textWidth(t.sup.uppercased(), font: supFont) + mm(0.3)
        var x = mm(pageW / 2) - (wB + wS + wA) / 2
        drawString(before, atX: x, baselineYMm: y, font: font, color: ink, kern: cs)
        x += wB
        if !t.sup.isEmpty {
            drawString(t.sup.uppercased(), atX: x, baselineYMm: y - 1.6, font: supFont, color: ink)
            x += wS
        }
        if !after.isEmpty {
            drawString(after, atX: x, baselineYMm: y, font: font, color: ink, kern: cs)
        }
    }

    private static func drawRank(rank: Int, count: Int?, x: CGFloat, y: CGFloat, size: CGFloat, align: NSTextAlignment = .center) {
        let num = "\(rank)"
        let sup = rank == 1 ? "er" : "e"
        let rest = count.map { " / \($0)" } ?? ""
        let font = helvetica(size, .bold)
        let supFont = helvetica(size * 0.62, .bold)
        let wNum = textWidth(num, font: font)
        let wSup = textWidth(sup, font: supFont) + mm(0.15)
        let wRest = textWidth(rest, font: font)
        var left = mm(x)
        if align == .center { left -= (wNum + wSup + wRest) / 2 }
        drawString(num, atX: left, baselineYMm: y, font: font, color: ink)
        // Web subtracts `size * 0.13` from y (pt mixed into mm) — keep the same quirk for parity.
        drawString(sup, atX: left + wNum + mm(0.1), baselineYMm: y - size * 0.13, font: supFont, color: ink)
        drawString(rest, atX: left + wNum + wSup, baselineYMm: y, font: font, color: ink)
    }

    private static func drawAssiduite(count: Int, text textValue: String, x: CGFloat, y: CGFloat) {
        if count > 0 {
            let num = "\(count)"
            text(num, x: x, y: y, size: 8.2, weight: .bold, color: ink)
            let w = (num + " " as NSString).size(withAttributes: [.font: helvetica(8.2, .bold)]).width / (72 / 25.4)
            let rest = String(textValue.dropFirst(num.count + 1))
            text(rest, x: x + w, y: y, size: 8.2, weight: .regular, color: ink)
        } else {
            text(textValue, x: x, y: y, size: 8.2, weight: .regular, color: ink)
        }
    }

    private static func stroke(x1: CGFloat, y1: CGFloat, x2: CGFloat, y2: CGFloat, color: UIColor, width: CGFloat) {
        let path = UIBezierPath()
        path.move(to: CGPoint(x: mm(x1), y: mm(y1)))
        path.addLine(to: CGPoint(x: mm(x2), y: mm(y2)))
        path.lineWidth = width * 72 / 25.4
        color.setStroke()
        path.stroke()
    }

    private static func strokeRect(x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat, color: UIColor, width: CGFloat) {
        let path = UIBezierPath(rect: CGRect(x: mm(x), y: mm(y), width: mm(w), height: mm(h)))
        path.lineWidth = width * 72 / 25.4
        color.setStroke()
        path.stroke()
    }

    private static func fillRect(x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat, color: UIColor) {
        color.setFill()
        UIBezierPath(rect: CGRect(x: mm(x), y: mm(y), width: mm(w), height: mm(h))).fill()
    }

    private static func wrap(_ string: String, width: CGFloat, font: UIFont) -> [String] {
        let rect = CGSize(width: mm(width), height: .greatestFiniteMagnitude)
        let attrs: [NSAttributedString.Key: Any] = [.font: font]
        let storage = NSTextStorage(string: string, attributes: attrs)
        let container = NSTextContainer(size: rect)
        container.lineFragmentPadding = 0
        let manager = NSLayoutManager()
        manager.addTextContainer(container)
        storage.addLayoutManager(manager)
        var lines: [String] = []
        var index = 0
        while index < manager.numberOfGlyphs {
            var range = NSRange()
            manager.lineFragmentUsedRect(forGlyphAt: index, effectiveRange: &range)
            let charRange = manager.characterRange(forGlyphRange: range, actualGlyphRange: nil)
            lines.append((string as NSString).substring(with: charRange).trimmingCharacters(in: .newlines))
            index = NSMaxRange(range)
        }
        return lines.isEmpty ? [string] : lines
    }

    private static func truncate(_ string: String, maxWidth: CGFloat, font: UIFont) -> String {
        let attrs: [NSAttributedString.Key: Any] = [.font: font]
        if (string as NSString).size(withAttributes: attrs).width <= maxWidth { return string }
        var s = string
        while s.count > 1 {
            s = String(s.dropLast())
            let trial = s + "…"
            if (trial as NSString).size(withAttributes: attrs).width <= maxWidth { return trial }
        }
        return "…"
    }

    private static func qrImage(from string: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
        let context = CIContext()
        guard let cg = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

private extension String {
    var nilIfEmpty: String? {
        let t = trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }
}
