---
summary: Records why Search returns flat field-keyed rows.
read_when:
  - changing Search result rows or response context
---

# Return flat Search rows

Search returns each row as a flat mapping from selected field names to values, while request resolution, account identity, archive provenance, and pagination remain structured response context. Nested resource objects were rejected because Search has a dynamic field selection and column-oriented result contract; flat rows preserve a one-to-one relationship between requested fields and returned keys and align with Google Ads MCP search results and Amazon report outputs.
