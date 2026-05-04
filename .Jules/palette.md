## 2026-05-04 - Icon-Only Button Accessibility
**Learning:** Icon-only buttons lacking explicit labels are invisible or confusing to screen reader users.
**Action:** Always ensure `<button>` elements that only contain `<ion-icon>` children have descriptive `aria-label` and `title` attributes. Additionally, mark the inner `<ion-icon>` with `aria-hidden="true"` so screen readers do not try to parse the icon natively.
