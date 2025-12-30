# GitLab MCP Test Suite

This directory contains the test suite for the GitLab MCP server.

## Test Files

### readonly-mcp-tests.ts
Integration tests for all read-only MCP tools.

**What it tests:**
- All read-only API operations
- Project management tools
- Issue management tools
- Merge request tools
- Pipeline tools
- File operations
- Commit operations
- Labels, namespaces, users
- Events, milestones, wiki pages

**Running the tests:**
```bash
npm run test:mcp:readonly
```

**Prerequisites:**
- Set `GITLAB_PERSONAL_ACCESS_TOKEN` or `GITLAB_TOKEN` environment variable
- Optionally set `GITLAB_PROJECT_ID` for project-specific tests
- Set `GITLAB_API_URL` if using self-hosted GitLab

### test-all-transport-server.ts
Tests for different MCP transport protocols (stdio, SSE, streamable-http).

**Running the tests:**
```bash
npm run test:server
```

## Running All Tests

To run the complete test suite:

```bash
npm run test:all
```

This will run:
1. Unit tests (bun test)
2. Read-only MCP integration tests

## Environment Variables

### For Integration Tests
- `GITLAB_PERSONAL_ACCESS_TOKEN` - GitLab personal access token (required)
- `GITLAB_PROJECT_ID` - Test project ID (optional but recommended)
- `GITLAB_API_URL` - GitLab API URL (default: `https://gitlab.com/api/v4`)

## Test Results

Test results are saved as JSON files:
- `test-results-readonly.json` - Read-only MCP test results

## CI/CD Integration

The test suite can be integrated into CI/CD pipelines:

```yaml
# Example GitLab CI configuration
test:
  script:
    - npm install
    - npm run build
    - npm run test:all
  variables:
    GITLAB_PERSONAL_ACCESS_TOKEN: $CI_JOB_TOKEN
    GITLAB_PROJECT_ID: $CI_PROJECT_ID
```

## Writing New Tests

### Adding MCP Tool Tests

Add new tools to the `mcpTools` array in `readonly-mcp-tests.ts`:

```typescript
{
  name: 'new_tool_name',
  category: 'category',
  required: true
}
```

Add parameter setup in `setupToolParameters()` if needed.

## Troubleshooting

### Integration Tests Failing
- Verify `GITLAB_PERSONAL_ACCESS_TOKEN` is valid
- Check GitLab API URL is accessible
- Ensure test project exists if `GITLAB_PROJECT_ID` is set
- Check rate limiting on GitLab API

### Permission Errors
- Ensure write access to test directories

## Test Coverage

Current test coverage:

### MCP Tools
- ✅ All read-only operations
- ⏭️ Write operations (would modify GitLab data)
- ⏭️ Destructive operations (would delete GitLab data)

## Future Improvements

Planned test enhancements:
- [ ] Write operation tests with cleanup
- [ ] Performance benchmarking
- [ ] Concurrent request testing
- [ ] Error recovery testing
- [ ] Network failure simulation
