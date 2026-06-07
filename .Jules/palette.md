## 2024-05-15 - Managing Async Form Submissions
**Learning:** Found that custom modals performing async actions (like logging a sale or submitting feedback) often miss loading states. Users might click "Submit" multiple times causing duplicate entries because the button doesn't give immediate feedback that processing has started.
**Action:** When adding or reviewing modal form submissions, always pair the async request with an `isSubmitting` signal. Use this signal to disable the submit button and reveal an `<ion-spinner>` so the user knows their action was received.
