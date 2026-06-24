## 2024-05-18 - Missing Loading State on Async Operations

**Learning:** Missing loading states on async actions (e.g. logging a sale) causes user confusion. Users might click the submit button multiple times if they don't see immediate feedback.
**Action:** Always add a loading spinner and disable the button while an async operation is in progress.
