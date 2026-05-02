## 2025-05-02 - Icon-Only Button Accessibility Pattern
**Learning:** Found several icon-only buttons across multiple views (`app.html`, `products.html`, `admin.ts`) missing `aria-label` attributes, which makes them inaccessible to screen readers. This pattern appears common when using inline ion-icons within container buttons.
**Action:** When adding new icon-only buttons (`btn-icon-premium`, `btn-icon-dark`, etc), always ensure an `aria-label` is included explaining the action (e.g. "View user details", "Close modal").
