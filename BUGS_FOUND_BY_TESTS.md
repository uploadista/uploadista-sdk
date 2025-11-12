# Bugs Found by Test Coverage Implementation

This document tracks bugs discovered during the comprehensive test coverage implementation for uploadista-sdk.

## Core Package (`@uploadista/core`)

### UploadistaError Tests Failures

**Test File**: `tests/errors/uploadista-error.test.ts`

**Failing Tests** (5 failures):
1. ❌ `should create error with all properties` - Error constructor or property assignment issue
2. ❌ `should convert error to failure result` - Result type conversion failing
3. ❌ `should create failure result from error code` - Result creation from error code not working
4. ❌ `should allow overriding error properties` - Property override mechanism broken
5. ❌ `should work with all error codes` - Some error codes failing

**Impact**: Medium - Error handling is critical but existing error creation works, these are edge cases

**Status**: Needs investigation

---

### Time Operations with TestClock Failures

**Test File**: `tests/utils/time-operations.test.ts`

**Failing Tests** (7 failures):

1. ❌ `should handle multiple delays in sequence` - Timeout (5000ms)
   - **Issue**: Test times out, likely TestClock not advancing properly

2. ❌ `should handle timeout that expires` - TimeoutException
   - **Issue**: Timeout is expiring unexpectedly after 5s

3. ❌ `should handle multiple timeouts` - Timeout (5000ms)
   - **Issue**: Test times out

4. ❌ `should handle fixed interval scheduling` - Assertion failure
   - **Expected**: 5 executions
   - **Received**: 4 executions
   - **Issue**: Schedule not executing the expected number of times

5. ❌ `should handle nested timeouts` - TimeoutException (2s)
   - **Issue**: Nested timeout handling broken

6. Additional timeouts/failures in:
   - Debounce with timing precision
   - Race conditions with clock
   - Throttle with delays

**Impact**: Medium - TestClock usage is important for testing but not core functionality

**Root Cause**: Likely improper TestClock.adjust() usage or misunderstanding of Effect's TestClock behavior

**Status**: Needs investigation of TestClock API usage

---

### Flow Engine Tests Issues

**Test File**: `tests/flow/flow.test.ts`

**Issues** (Not failures, but warnings):
- Multiple "Node X has no input data" ERROR logs during test execution
- This suggests nodes are executing without proper input data setup

**Tests Passing**: All flow tests are passing despite the error logs

**Impact**: Low - Tests are passing but logs indicate potential issues in test setup or node execution logic

**Status**: Needs cleanup - either fix test setup or suppress expected error logs

---

### Node Execution Tests Issues

**Test File**: `tests/flow/node.test.ts`

**Issues**:
- Some tests producing "Node X has no input data" errors
- Node execution with missing dependencies showing warnings

**Impact**: Low - Tests passing but logs are noisy

**Status**: Test setup needs refinement

---

### Upload Processing Tests

**Test File**: `tests/upload/create-upload.test.ts`

**Issues**:
- 1 test failing in flow execution lifecycle
- FlowResult not having expected `waiting` state with `partialData`

**Impact**: Medium - Upload flow state management issue

**Status**: Needs investigation

---

## Summary

### Total Issues Found
- **5 failures** in error handling (uploadista-error.test.ts)
- **7 failures** in time operations (time-operations.test.ts)
- **1 failure** in upload flow lifecycle
- **Multiple warnings** in flow/node tests (passing but noisy logs)

### Priority Order
1. **High**: Fix UploadistaError result conversion failures (critical for error handling)
2. **Medium**: Fix upload flow lifecycle issue (affects core upload functionality)
3. **Medium**: Investigate TestClock usage patterns (affects test reliability)
4. **Low**: Clean up flow/node test error logs (test quality)

### Next Steps
1. Investigate UploadistaError.toFailure() and fromCode() implementations
2. Review Flow execution state management for "waiting" state
3. Study Effect TestClock documentation and proper usage patterns
4. Add test setup utilities to suppress expected error logs in flow tests
