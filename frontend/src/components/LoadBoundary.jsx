import { Component } from 'react';

export default class LoadBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="error-state" role="alert">
      <b>סביבת הניטור לא נטענה</b>
      <span>ייתכן שהאתר עודכן או שהחיבור נקטע.</span>
      <button type="button" onClick={() => window.location.reload()}>טעינה מחדש</button>
    </div>;
  }
}
