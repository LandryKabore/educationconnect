import UIKit
import SwiftUI

enum EmploiDuTempsPdf {
    struct Input {
        var schoolName: String
        var className: String
        var studentName: String?
        var extraLine: String?
        var slots: [TimetableSlot]
    }

    private static let days: [(day: Int, label: String)] = [
        (1, "Lundi"), (2, "Mardi"), (3, "Mercredi"),
        (4, "Jeudi"), (5, "Vendredi"), (6, "Samedi"),
    ]

    static func make(_ input: Input) -> Data {
        let page = CGRect(x: 0, y: 0, width: 842, height: 595) // A4 landscape
        let renderer = UIGraphicsPDFRenderer(bounds: page)
        return renderer.pdfData { ctx in
            ctx.beginPage()
            let bounds = page.insetBy(dx: 28, dy: 24)
            draw(in: bounds, input: input)
        }
    }

    private static func draw(in bounds: CGRect, input: Input) {
        let titleFont = UIFont.systemFont(ofSize: 16, weight: .bold)
        let bodyFont = UIFont.systemFont(ofSize: 10, weight: .regular)
        let smallBold = UIFont.systemFont(ofSize: 9, weight: .semibold)
        let tiny = UIFont.systemFont(ofSize: 7.5, weight: .regular)

        var y = bounds.minY
        drawText("EduFaso — Emploi du temps", at: CGPoint(x: bounds.minX, y: y), font: titleFont, color: PdfColors.teal)
        y += 20
        drawText(input.schoolName.isEmpty ? "École" : input.schoolName, at: CGPoint(x: bounds.minX, y: y), font: bodyFont, color: PdfColors.ink)
        y += 14
        drawText("Classe : \(input.className.isEmpty ? "—" : input.className)", at: CGPoint(x: bounds.minX, y: y), font: bodyFont, color: PdfColors.ink)
        y += 14
        if let student = input.studentName, !student.isEmpty {
            drawText("Élève : \(student)", at: CGPoint(x: bounds.minX, y: y), font: bodyFont, color: PdfColors.ink)
            y += 14
        }
        if let extra = input.extraLine, !extra.isEmpty {
            drawText(extra, at: CGPoint(x: bounds.minX, y: y), font: bodyFont, color: PdfColors.muted)
            y += 14
        }

        let slots = input.slots.filter { (1...6).contains($0.dayOfWeek) }
        guard !slots.isEmpty else {
            drawText("Aucun créneau planifié.", at: CGPoint(x: bounds.minX, y: y + 20), font: bodyFont, color: PdfColors.muted)
            return
        }

        let rangeStart = max(0, (slots.map { minutes($0.startTime) }.min() ?? 480) - 15)
        let rangeEnd = min(24 * 60, (slots.map { minutes($0.endTime) }.max() ?? 1080) + 15)
        let span = max(60, rangeEnd - rangeStart)

        let gridTop = y + 8
        let footerY = bounds.maxY - 8
        let headerH: CGFloat = 22
        let timeColW: CGFloat = 42
        let gridBottom = footerY - 18
        let bodyTop = gridTop + headerH
        let bodyH = gridBottom - bodyTop
        let dayColW = (bounds.width - timeColW) / CGFloat(days.count)

        // Frame
        let gridRect = CGRect(x: bounds.minX, y: gridTop, width: bounds.width, height: gridBottom - gridTop)
        PdfColors.ink.setStroke()
        UIBezierPath(rect: gridRect).stroke()

        // Header row
        PdfColors.headerFill.setFill()
        UIBezierPath(rect: CGRect(x: bounds.minX, y: gridTop, width: bounds.width, height: headerH)).fill()
        drawCentered("Heure", in: CGRect(x: bounds.minX, y: gridTop, width: timeColW, height: headerH), font: smallBold, color: PdfColors.ink)
        for (i, day) in days.enumerated() {
            let x = bounds.minX + timeColW + CGFloat(i) * dayColW
            drawCentered(day.label, in: CGRect(x: x, y: gridTop, width: dayColW, height: headerH), font: smallBold, color: PdfColors.ink)
            // vertical separators
            let path = UIBezierPath()
            path.move(to: CGPoint(x: x, y: gridTop))
            path.addLine(to: CGPoint(x: x, y: gridBottom))
            PdfColors.ink.setStroke()
            path.lineWidth = 0.6
            path.stroke()
        }
        // time column separator
        let timeSep = UIBezierPath()
        timeSep.move(to: CGPoint(x: bounds.minX + timeColW, y: gridTop))
        timeSep.addLine(to: CGPoint(x: bounds.minX + timeColW, y: gridBottom))
        timeSep.lineWidth = 0.8
        PdfColors.ink.setStroke()
        timeSep.stroke()

        // Hour marks
        let firstHour = Int(ceil(Double(rangeStart) / 60.0))
        let lastHour = Int(floor(Double(rangeEnd) / 60.0))
        for hour in firstHour...lastHour {
            let m = hour * 60
            let yy = bodyTop + CGFloat(m - rangeStart) / CGFloat(span) * bodyH
            let line = UIBezierPath()
            line.move(to: CGPoint(x: bounds.minX + timeColW, y: yy))
            line.addLine(to: CGPoint(x: bounds.maxX, y: yy))
            PdfColors.line.setStroke()
            line.lineWidth = 0.4
            line.stroke()
            drawText(
                String(format: "%dh", hour),
                at: CGPoint(x: bounds.minX + 6, y: yy - 5),
                font: tiny,
                color: PdfColors.muted
            )
        }

        // Slots
        for slot in slots {
            guard let dayIdx = days.firstIndex(where: { $0.day == slot.dayOfWeek }) else { continue }
            let start = minutes(slot.startTime)
            let end = minutes(slot.endTime)
            let top = bodyTop + CGFloat(start - rangeStart) / CGFloat(span) * bodyH
            let height = max(16, CGFloat(end - start) / CGFloat(span) * bodyH - 2)
            let x = bounds.minX + timeColW + CGFloat(dayIdx) * dayColW + 3
            let w = dayColW - 6
            let rect = CGRect(x: x, y: top, width: w, height: height)

            let swatch = SubjectPalette.swatch(for: slot.matieres?.name)
            let fill = PdfColors.uiColor(from: swatch.fill)
            let border = PdfColors.uiColor(from: swatch.border)
            fill.setFill()
            border.setStroke()
            let card = UIBezierPath(roundedRect: rect, cornerRadius: 3)
            card.lineWidth = 1
            card.fill()
            card.stroke()

            let subject = slot.matieres?.name ?? "Cours"
            let timeLabel = "\(hhmm(slot.startTime))–\(hhmm(slot.endTime))"
            var textY = rect.minY + 3
            drawText(subject, at: CGPoint(x: rect.minX + 3, y: textY), font: UIFont.systemFont(ofSize: height < 22 ? 6.5 : 7.5, weight: .bold), color: PdfColors.ink, maxWidth: w - 6)
            textY += height < 22 ? 9 : 11
            if textY + 8 < rect.maxY {
                drawText(timeLabel, at: CGPoint(x: rect.minX + 3, y: textY), font: tiny, color: PdfColors.muted, maxWidth: w - 6)
                textY += 9
            }
            if let teacher = slot.teacherName, textY + 8 < rect.maxY {
                drawText(teacher, at: CGPoint(x: rect.minX + 3, y: textY), font: tiny, color: PdfColors.muted, maxWidth: w - 6)
                textY += 9
            }
            if let room = slot.room?.trimmingCharacters(in: .whitespacesAndNewlines), !room.isEmpty, textY + 8 < rect.maxY {
                let roomLabel = room.lowercased().hasPrefix("salle") ? room : "Salle \(room)"
                drawText(roomLabel, at: CGPoint(x: rect.minX + 3, y: textY), font: tiny, color: PdfColors.muted, maxWidth: w - 6)
            }
        }

        // Outer frame again
        PdfColors.ink.setStroke()
        UIBezierPath(rect: gridRect).stroke()

        let df = DateFormatter()
        df.locale = Locale(identifier: "fr_FR")
        df.dateStyle = .full
        drawText("Généré le \(df.string(from: Date()))", at: CGPoint(x: bounds.minX, y: footerY - 2), font: tiny, color: PdfColors.muted)
    }

    private static func minutes(_ time: String) -> Int {
        let parts = time.split(separator: ":")
        let h = Int(parts.first ?? "0") ?? 0
        let m = parts.count > 1 ? (Int(parts[1]) ?? 0) : 0
        return h * 60 + m
    }

    private static func hhmm(_ time: String) -> String {
        String(time.prefix(5))
    }

    private static func drawText(
        _ text: String,
        at point: CGPoint,
        font: UIFont,
        color: UIColor,
        maxWidth: CGFloat? = nil
    ) {
        let attrs: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: color,
        ]
        let ns = text as NSString
        if let maxWidth {
            let size = ns.boundingRect(
                with: CGSize(width: maxWidth, height: 40),
                options: [.usesLineFragmentOrigin, .usesFontLeading],
                attributes: attrs,
                context: nil
            ).size
            ns.draw(in: CGRect(origin: point, size: CGSize(width: maxWidth, height: ceil(size.height))), withAttributes: attrs)
        } else {
            ns.draw(at: point, withAttributes: attrs)
        }
    }

    private static func drawCentered(_ text: String, in rect: CGRect, font: UIFont, color: UIColor) {
        let attrs: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: color,
        ]
        let size = (text as NSString).size(withAttributes: attrs)
        let point = CGPoint(
            x: rect.midX - size.width / 2,
            y: rect.midY - size.height / 2
        )
        (text as NSString).draw(at: point, withAttributes: attrs)
    }
}
