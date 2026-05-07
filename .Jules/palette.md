
## 2026-05-07 - Native Parsing of Ionic Icons in Buttons
**Learning:** In this application, `<ion-icon>` elements inside icon-only buttons can be natively parsed by screen readers in unpredictable ways.
**Action:** Always wrap icon-only buttons with descriptive `aria-label` and `title` attributes on the outer button, and explicitly mark the inner `<ion-icon>` with `aria-hidden="true"` so screen readers ignore the icon and rely on the button's ARIA label.
