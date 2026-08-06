---
summary: Records why Search uses bounded keyset cursors instead of offsets.
read_when:
  - changing Search ordering, limits, cursors, or CLI all-page behavior
---

# Use keyset cursors for Search pagination

Search pagination uses a bounded `limit` and an opaque continuation cursor that encodes a deterministic keyset boundary and query fingerprint; numeric offsets are not public. Search defaults to 20 rows and accepts an explicit limit up to 200. The smaller default keeps routine tool results proportionate to an agent's working context, while the explicit maximum supports deliberate bulk reads. Offsets were rejected because callers must calculate positions and concurrent insertions or deletions can shift page boundaries, while agents can reliably echo a server-issued cursor and the CLI can follow cursors automatically for `--all`. BidBeacon appends resource ID to the effective ordering as a stable tie-breaker.
