import './ReportPreview.css'

// Καθαρά presentational — μηδενική νέα λογική παραγωγής κειμένου. Ίδιος κανόνας μορφοποίησης
// γραμμών (#/##/###) με το utils/reportDocx.js, απλά αποδίδει HTML αντί για docx Paragraph —
// δεύτερη παρουσίαση του ίδιου κειμένου, όχι δεύτερη πηγή αλήθειας.
export default function ReportPreview({ text }) {
  const lines = text.split('\n')

  return (
    <div className="report-preview">
      {lines.map((line, i) => {
        if (line.startsWith('### ')) return <h3 key={i}>{line.slice(4)}</h3>
        if (line.startsWith('## ')) return <h2 key={i}>{line.slice(3)}</h2>
        if (line.startsWith('# ')) return <h1 key={i}>{line.slice(2)}</h1>
        if (line.trim() === '') return <div key={i} className="report-preview__spacer" />
        return <p key={i}>{line}</p>
      })}
    </div>
  )
}
