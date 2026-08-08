---
summary: Records how Search reports conservative archive coverage from existing report metadata.
read_when:
  - changing performance ingestion, report metadata retention, or Search coverage
---

# Derive performance coverage from report metadata

Performance Search derives coverage from BidBeacon's existing canonical Target report metadata rather than introducing a separate coverage ledger. A date is complete only when its daily Target report completed with zero parse errors. Other known report states and parse errors produce compact coverage issues; a date without metadata is unknown rather than inferred from performance rows. Completed daily metadata is retained after Amazon's 15-month report retrieval window so new coverage evidence remains durable. Existing history whose metadata was already deleted remains unknown.

This keeps the public contract honest while reusing the pipeline's explicit evidence that Amazon returned and BidBeacon processed a report, including valid empty reports. Inferring coverage from performance rows was rejected because zero-activity dates legitimately contain no rows. A separate ledger remains an option if report metadata later proves insufficient.
