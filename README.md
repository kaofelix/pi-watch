# pi-watch

A [pi](https://github.com/badlogic/pi) extension that watches for AI comments in your code and sends them to the agent.

> Inspired by [aider's watch mode](https://aider.chat/docs/usage/watch.html).

## Installation

```bash
pi install npm:pi-watch
```

Or try it without installing:

```bash
pi -e npm:pi-watch --watch
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

### Multi-line Comments

Multi-line comments work too! Add the `AI` marker to each line you want included:

```javascript
// This function needs work AI
// fix the race condition AI!
function process(data) {
  return data.map(d => d.value);
}
```

Consecutive lines with `AI` markers are collected together and sent as one message.

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

## License

MIT
