import { Component } from 'react'

// Δίχτυ ασφαλείας γύρω από όλη την εφαρμογή: ένα απρόβλεπτο σφάλμα rendering (π.χ. δεδομένα
// που άλλαξαν από άλλη καρτέλα ενόσω η οθόνη ήταν ανοιχτή) δεν πρέπει να αφήνει τον εκπαιδευτικό
// σε λευκή οθόνη χωρίς καμία διέξοδο — του δίνει τουλάχιστον έναν τρόπο να γυρίσει στην αρχική.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Απρόβλεπτο σφάλμα:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page">
          <p className="empty-state">Κάτι πήγε στραβά. Δοκίμασε να επιστρέψεις στην αρχική.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              this.setState({ hasError: false })
              window.location.hash = '#/'
            }}
          >
            ← Αρχική
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
