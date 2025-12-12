# Mochi MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io/) server that enables AI agents (Claude, Codex, etc.) to manage your [Mochi.cards](https://mochi.cards) flashcards.

## Features

- **Browse** decks and cards
- **Search** cards by content or tags
- **Create/Update** cards with two-phase commit (preview before applying)
- **Delete** cards with typed confirmation (safety first)
- **Robust safety** - deck deletion disabled by default

## Quick Start

```bash
# Install
npm install

# Build
npm run build

# Run (needs your Mochi API key)
MOCHI_API_KEY=your_key_here node dist/index.js
```

Get your API key from the Mochi app: Settings → Account → API Key.

## Usage with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mochi": {
      "command": "node",
      "args": ["/path/to/mochi-mcp/dist/index.js"],
      "env": {
        "MOCHI_API_KEY": "your_api_key"
      }
    }
  }
}
```

Then ask Claude: "List my Mochi decks" or "Search for cards about gradients".

## Tools

### Read Operations
| Tool | Description |
|------|-------------|
| `list_decks` | List all decks |
| `get_deck` | Get deck with card list |
| `get_card` | Get full card content |
| `get_cards` | Get multiple cards by ID |
| `search_cards` | Search by text, tags, or date. Returns rich results (deckId, createdAt, etc.) |
| `list_cards_page` | Paginated card listing with bookmark |
| `find_deck_by_name` | Find decks by name (case-insensitive partial match) |

### Write Operations (Two-Phase Commit)
| Tool | Description |
|------|-------------|
| `create_card_preview` | Preview new card → returns token |
| `apply_create_card` | Apply creation with token |
| `update_card_preview` | Preview edit with diff → returns token |
| `update_card_fields_preview` | Preview Q/A edit → returns token |
| `apply_update_card` | Apply update with token |
| `update_cards_batch_preview` | Preview batch updates |
| `apply_update_cards_batch` | Apply batch updates |

### Tag Operations (Two-Phase)
| Tool | Description |
|------|-------------|
| `add_tags_preview` | Preview adding tags to cards |
| `remove_tags_preview` | Preview removing tags |
| `apply_tags_update` | Apply tag changes with token |

### Delete Operations (Requires Confirmation)
| Tool | Description |
|------|-------------|
| `delete_card` | Soft-delete (requires: "delete card \<id\>") |
| `delete_deck` | Disabled by default |

## Performance Notes

- **Global search** scans at most **1000 cards**
- **Per-deck search** scans at most **5000 cards**
- Use `list_cards_page` with pagination for larger collections
- Date filters use **UTC** (ISO 8601 format: `YYYY-MM-DDTHH:mm:ss.sssZ`)

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MOCHI_API_KEY` | ✅ | - | Your Mochi API key |
| `MOCHI_ALLOW_DECK_DELETE` | ❌ | `false` | Enable deck deletion |
| `MOCHI_TOKEN_EXPIRY_MINS` | ❌ | `10` | Preview token validity |

## Safety Design

1. **Two-phase commit**: Create/update operations show a preview first. You approve by using the returned token.

2. **Typed confirmations**: Delete requires typing `"delete card <id>"` exactly.

3. **Deck deletion disabled**: Must set `MOCHI_ALLOW_DECK_DELETE=true` to enable.

4. **Soft delete default**: Cards go to trash (recoverable in Mochi app).

## Development

```bash
# Run tests
npm test

# Type check
npm run lint

# Development mode
MOCHI_API_KEY=your_key npm run dev

# Test with MCP Inspector
npm run inspect
```

## License

MIT
