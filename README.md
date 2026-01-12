# Watch Extension

Watches for file changes in the current directory and scans for AI comments.

## Development

```bash
# Run tests
npm test

# Check code with Biome (lint + format)
npm run check

# Auto-fix Biome issues
npm run check:fix

# Format code with Biome
npm run format
```

## Usage

Run pi with the `--watch` flag:

```bash
pi --watch
```

## How It Works

Add comments to your files using supported comment styles (`#`, `//`, `--`):

- `AI` - Collects the comment, waits for a trigger
- `AI!` - Triggers sending all collected comments to the AI agent

The `AI` marker can be at the start or end of a comment line, and is case-insensitive.

### Examples

```typescript
// AI! Add error handling to this function
function process(data) {
  return data.map(d => d.value);
}
```

```python
# Extract this logic into a helper function AI
def calculate_total(items):
    total = 0
    for item in items:
        total += item.price
    return total
```

### Multi-file Comments

AI comments can span multiple files. All comments are collected until an `AI!` trigger is found, then all are sent together.

### Comment Groups

Consecutive AI comment lines are grouped together. If any line in the group has `AI!`, the entire group triggers the action.

```javascript
// Refactor this function
// to use async/await instead of callbacks AI!
```
