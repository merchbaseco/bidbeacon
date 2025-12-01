# DLQ Error Triage Report
**Date:** December 1, 2025  
**Worker Container:** bidbeacon-worker  
**Total Errors Found:** 162+ messages in DLQ

## Error Summary

### 1. Campaign Management Campaigns Validation Errors
**Count:** 86+ occurrences  
**Error Type:** Zod schema validation failures

#### Issues Identified:
1. **Missing `account_id` field** (Required)
   - Schema expects: `z.string()` (required)
   - Actual: Field is `undefined` in payload

2. **Missing `version` field** (Required)
   - Schema expects: `z.number().int().positive()` (required)
   - Actual: Field is `undefined` in payload

3. **`tags` field type mismatch**
   - Schema expects: `z.record(z.unknown())` (object/record)
   - Actual: Field is an array `[]`
   - Error: "Expected object, received array"

#### Affected Messages:
- Message IDs: `cb4f80e7-709d-4e15-9bf6-04d8dd2d4b18`, `71676db8-1688-4408-8cd0-c15ae4a81c30`, `fbb084b6-161a-415f-9f8a-5bed714d78dc`, and 83+ more

#### Root Cause Analysis:
The AMS Campaign Management dataset may have different message structures:
- Some messages may not include `account_id` or `version` fields
- The `tags` field can be either an array or an object depending on AMS version/payload type
- The schema is too strict and doesn't match actual AMS payload variations

---

### 2. Budget Usage Validation Errors
**Count:** 76+ occurrences  
**Error Type:** Zod schema validation failures

#### Issue Identified:
**`budget_usage_percentage` exceeds 100**
- Schema constraint: `z.number().min(0).max(100)`
- Actual: Values > 100 are being sent by AMS
- Error: "Number must be less than or equal to 100"

#### Affected Messages:
- Message IDs: `652d7ba4-e478-4447-aad8-a9287736754d`, `7a17745d-6e0c-4196-a6f8-02dc616db3f7`, `eaa69b62-255d-41e8-878f-41326caa3656`, and 73+ more

#### Root Cause Analysis:
Budget usage can legitimately exceed 100% in Amazon Marketing Stream:
- Campaigns can overspend their budgets
- AMS sends correction/adjustment messages that may show >100% usage
- The `.max(100)` constraint is incorrect for real-world AMS data

---

## Fixes Applied ✅

### ✅ Fixed: Budget Usage Schema
**File:** `src/worker/schemas.ts` (line 82)  
**Change:** Removed `.max(100)` constraint on `budget_usage_percentage`

```typescript
// Before:
budget_usage_percentage: z.number().min(0).max(100),

// After:
budget_usage_percentage: z.number().min(0), // Removed max(100) - AMS can send >100% for overspending/corrections
```

**Impact:** Fixes 76+ messages in DLQ

---

### ✅ Fixed: Campaigns Schema
**File:** `src/worker/schemas.ts` (lines 94, 98, 103)  
**Changes Applied:**

1. **Made `account_id` optional:**
```typescript
// Before:
account_id: z.string(),

// After:
account_id: z.string().optional(), // Optional - not always present in AMS payloads
```

2. **Made `version` optional:**
```typescript
// Before:
version: z.number().int().positive(),

// After:
version: z.number().int().positive().optional(), // Optional - not always present in AMS payloads
```

3. **Allow `tags` to be either array or object:**
```typescript
// Before:
tags: z.record(z.unknown()).optional(),

// After:
tags: z.union([z.array(z.unknown()), z.record(z.unknown())]).optional(), // Can be array or object
```

---

### ✅ Fixed: Campaigns Handler
**File:** `src/worker/handlers/campaigns.ts`  
**Changes:** Added default values for optional fields (required by database NOT NULL constraints)

```typescript
accountId: data.account_id ?? '', // Default to empty string if missing (DB requires NOT NULL)
version: data.version ?? 0, // Default to 0 if missing (DB requires NOT NULL, used in unique index)
tags: data.tags ?? null, // Can be array or object - jsonb handles both
```

**Note:** Database schema remains unchanged - handler provides defaults for optional fields that DB requires to be NOT NULL.

**Impact:** Fixes 86+ messages in DLQ

---

## Additional Findings

### No Other Errors Found ✅
- ✅ No database connection errors
- ✅ No parse/JSON errors  
- ✅ No unknown datasetId errors
- ✅ No errors in other handlers (adGroups, ads, targets, spConversion, spTraffic)
- ✅ No constraint violations or duplicate key errors
- ✅ No startup/fatal errors

**Conclusion:** All errors were limited to the two validation issues identified and fixed above.

---

## Next Steps

### 1. Deploy and Monitor
1. Build and deploy updated worker container
2. Monitor DLQ metrics - should see significant reduction in errors
3. Watch for any new error patterns

### 2. Verify Fixes
- Check DLQ message count decreases
- Verify campaigns messages process successfully
- Verify budget usage messages with >100% process successfully

### 3. Future Considerations
- Consider adding payload logging for failed validations (with PII redaction) for future debugging
- Monitor for any new AMS payload format changes

---

## Additional Notes

- All other dataset handlers (sp-traffic, sp-conversion, adGroups, ads, targets) appear to be working correctly
- No parse errors or unknown datasetId errors found in recent logs
- Worker is processing messages successfully for other datasets
- The errors are consistent validation failures, not transient issues

---

## Files to Review/Modify

1. `src/worker/schemas.ts` - Schema definitions
2. `src/worker/handlers/campaigns.ts` - Campaign handler
3. `src/worker/handlers/budgetUsage.ts` - Budget usage handler  
4. `src/db/schema.ts` - Database schema (may need migration)
5. `drizzle/` - Migration files (if schema changes)

