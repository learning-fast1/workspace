import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'

// Μετατρέπει το (πιθανόν επεξεργασμένο από τον χρήστη) κείμενο της έκθεσης σε αρχείο .docx.
// Γραμμές με "# "/"## "/"### " γίνονται επικεφαλίδες· οι υπόλοιπες απλές παράγραφοι.
export async function exportReportToDocx(text, filename) {
  const lines = text.split('\n')

  const children = lines.map((line) => {
    if (line.startsWith('### ')) {
      return new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3 })
    }
    if (line.startsWith('## ')) {
      return new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 })
    }
    if (line.startsWith('# ')) {
      return new Paragraph({ text: line.slice(2), heading: HeadingLevel.TITLE })
    }
    if (line.trim() === '') {
      return new Paragraph({ text: '' })
    }
    return new Paragraph({ children: [new TextRun(line)] })
  })

  const doc = new Document({
    sections: [{ children }]
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
