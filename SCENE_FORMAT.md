# Scene format (v1)

The on-disk shape of a saved scene. One JSON file today; will become a folder containing `scene.json` + per-scene `code/` once we have scene-specific custom code (see ARCHITECTURE.md → "2. Scenes"). The JSON shape below stays the same when that happens.

## Top level

```json
{
  "version": 1,
  "name": "snowflake-reel",
  "duration": 0,
  "root": { ... },
  "animations": []
}
```

| Field | Type | Notes |
|---|---|---|
| `version` | integer | Always `1`. Bumped on breaking changes. |
| `name` | string | Human-readable; default filename on save. |
| `duration` | number | Seconds. `0` for now — Phase 5 wires it up. |
| `root` | Node | The component tree root. Required. |
| `animations` | array | Reserved. Empty for v1; Phase 5 defines the entry shape. |

Future fields (not yet present): `target` (export format like `reel`/`square`/`1080p`), `assets` (asset bundle manifest).

## Node shape

Every node in the tree:

```json
{
  "id": "grid-1",
  "component": "Grid",
  "props": { "mode": "columns", "columns": 4 },
  "children": [ ... ]
}
```

- **`id`** — string, unique across the whole tree. Auto-generated as `<lowercase-component>-<n>` when added via the GUI; any unique string is valid.
- **`component`** — string, must be in the runtime's `COMPONENT_REGISTRY`.
- **`props`** — object. Stores **only values that differ from the component's defaults**; the runtime fills in the rest via `withDefaults` on mount. Storing defaults too is legal but redundant.
- **`children`** — array of nodes. Empty array if the component holds no children. Components whose schema declares `children: 'none'` should always have an empty array.

## Validation

A loader rejects with a friendly error if:

- `version` is missing or unsupported.
- `root` is missing.
- Any `id` appears more than once anywhere in the tree.
- Any `component` is not in the runtime registry.

## What's NOT in v1

- **Per-scene custom code.** Scene-as-folder lands when the first lift needs it.
- **Asset bindings.** Image `src` is a URL/path for now. Phase 4 introduces folder-bound `@assets/...` references.
- **Animations.** Empty placeholder. Phase 5 freezes the entry shape (target, property, from/to, start, duration, easing).
- **Target format.** No declared aspect/resolution yet; the export driver (Phase 8) will read a `target` field once it exists.

## Forward compatibility

When fields are added, loaders should ignore unknown fields rather than reject. Breaking changes bump `version` to `2`; old files keep working via a migration step (TBD when we hit it).
