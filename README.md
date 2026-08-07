# sql-client

A lightweight, zero-dependency, in-memory SQL-like database for the browser and Node.js. Rows are stored as compact numeric arrays with string interning, lazy hydration via JS Proxies, and typed table definitions.

## Features

- **Zero dependencies** — Pure TypeScript/JavaScript. No WASM, no native binaries, no setup.
- **Memory efficient** — String interning stores duplicate strings once as numeric IDs in a shared pool.
- **Raw row storage** — Rows are contiguous arrays of numbers (e.g. `[1, 42, 1708500000]`).
- **Late materialization** — `WHERE` and `JOIN` callbacks run against lazy Proxies so only accessed columns are hydrated.
- **Relational queries** — Nested-loop inner joins across multiple tables.
- **Full CRUD** — `insert`, `update`, `delete`, and `query` with filtering, sorting, pagination, projection, and distinct.
- **Upsert support** — Conflict-key inserts with optional veto and payload transforms.
- **Fully typed** — Generic schema inference, nullable columns, and optional insert fields.

## Installation

```bash
npm install sql-client
```

Or via [JSR](https://jsr.io/@biru/sql-client):

```bash
npx jsr add @biru/sql-client
```

## Quick start

```ts
import { SQLTable, DataTypes } from 'sql-client'

type User = { id: number; name: string; createdAt: Date }
type Post = { id: number; authorId: number; title: string }

const users = new SQLTable<User>('users', {
	id:        { type: DataTypes.Number, autoIncrement: true },
	name:      { type: DataTypes.String },
	createdAt: { type: DataTypes.Datetime },
})

const posts = new SQLTable<Post>('posts', {
	id:       { type: DataTypes.Number, autoIncrement: true },
	authorId: { type: DataTypes.Number },
	title:    { type: DataTypes.String },
})

users.insert([
	{ name: 'Alice', createdAt: new Date() },
	{ name: 'Bob',   createdAt: new Date() },
])

posts.insert([
	{ authorId: 1, title: 'Introduction to TypeScript' },
	{ authorId: 1, title: 'Advanced Memory Management' },
	{ authorId: 2, title: 'SQL Joins Explained' },
])

const alicePosts = users.query({
	where: (user) => user.name === 'Alice',
	join: [{
		table: posts,
		on: (user, post) => user.id === post.authorId,
	}],
})

console.log(alicePosts)
// [
//   { id: 1, name: 'Alice', createdAt: Date, authorId: 1, title: 'Introduction to TypeScript' },
//   { id: 1, name: 'Alice', createdAt: Date, authorId: 1, title: 'Advanced Memory Management' },
// ]
```

## Defining tables

Column definitions are passed as an object keyed by column name:

```ts
const table = new SQLTable<MySchema>('my_table', {
	id:   { type: DataTypes.Number, autoIncrement: true },
	name: { type: DataTypes.String },
	when: { type: DataTypes.Datetime },
})
```

Supported column types:

| Type | Stored as | Notes |
|------|-----------|-------|
| `DataTypes.Number` | `number` | Supports `autoIncrement: true` |
| `DataTypes.String` | interned string ID | Reference-counted in a shared pool |
| `DataTypes.Datetime` | Unix timestamp (`number`) | Hydrated as `Date` on read |

Use `nullable: true` to allow `null` values. Append `as const` to the column config so TypeScript infers nullable fields correctly:

```ts
type Row = { id: number; name: string | null; score: number }

const table = new SQLTable<Row>('rows', {
	id:    { type: DataTypes.Number, autoIncrement: true },
	name:  { type: DataTypes.String, nullable: true },
	score: { type: DataTypes.Number },
} as const)
```

## Auto-increment

When a column has `autoIncrement: true`:

- Omit the field, pass `undefined`, or pass `null` (on a nullable column) to assign the next ID.
- Pass a value **less than or equal to** the current counter (commonly `-1`) as a sentinel to request auto-assignment when TypeScript requires a concrete number.

```ts
table.insert({ id: -1, name: 'Alice' }) // id → 1
table.insert({ id: -1, name: 'Bob'   }) // id → 2
table.insert({ id: 50, name: 'Eve'   }) // id → 50; next auto → 51
```

## Query

```ts
table.query({
	where:          (row) => row.score > 10,
	orderBy:        'name',
	orderDirection: 'ASC',       // 'ASC' | 'DESC'
	limit:          10,
	offset:         0,
	columns:        [{ name: 'role', distinct: true }],
	join: [{
		table:   otherTable,
		columns: ['title'],        // optional projection from the joined table
		on:      (left, right) => left.id === right.authorId,
	}],
})
```

Behavior notes:

- **Filtering** — `where` receives a lazy Proxy; only accessed properties are hydrated.
- **Sorting** — Applied across the full result set before `limit` / `offset`.
- **Distinct** — Mark a column with `distinct: true` in `columns`.
- **Joins** — Inner joins only; unmatched outer rows are excluded. One-to-many joins produce multiple result rows.
- **Pagination** — `where` runs first, then sorting, then `offset` and `limit`.

## Insert

```ts
// Single row or array
table.insert({ name: 'Alice' })
table.insert([{ name: 'Alice' }, { name: 'Bob' }])
```

### Upsert

Pass a `conflictKey` to update an existing row instead of inserting a duplicate:

```ts
table.insert(
	{ username: 'Alice', score: 99 },
	'username',                                    // conflict key
	(payload, old) => payload.score > old.score,   // optional: veto update
	(payload, old) => ({ ...payload, score: old.score + 5 }), // optional: transform payload
)
```

Rows whose conflict key is `undefined` or `null` are always inserted. Batches can mix inserts and updates in one call.

## Update

```ts
table.update(
	[{ id: 1, name: 'John' }, { id: 2, score: 50 }],
	(newValue, oldValue) => newValue.id === oldValue.id,
	(newValue, oldValue) => ({ ...newValue, score: oldValue.score + 10 }), // optional map
)
```

- `undefined` fields in the payload are **ignored** (partial updates).
- Returns the hydrated rows that were updated.

## Delete

```ts
table.delete()                                      // delete all rows
table.delete({ where: (row) => row.score < 0 })     // conditional delete
table.delete({ where: (row) => row.active === false, limit: 5 })
```

Deleted string values are released from the shared pool automatically.

## Nullability and `undefined`

By default, columns cannot be `null`. Set `nullable: true` in the column config (with `as const`) to allow it.

| Operation | `undefined` | `null` |
|-----------|-------------|--------|
| `insert()` on auto-increment column | Triggers auto-increment | Triggers auto-increment |
| `insert()` on nullable column | Stored as `null` | Stored as `null` |
| `insert()` on required column | TypeScript error | TypeScript error |
| `update()` | Ignored (field unchanged) | Sets column to `null` |

```ts
type User = { id: number; name: string | null; age: number }

const table = new SQLTable<User>('users', {
	id:   { type: DataTypes.Number, autoIncrement: true },
	name: { type: DataTypes.String, nullable: true },
	age:  { type: DataTypes.Number },
} as const)

table.insert([
	{ name: undefined, age: 22 }, // name → null, id → 1
	{ name: null,      age: 30 }, // name → null, id → 2
	{ id: 10, name: 'Irfan', age: 25 },
])

table.update(
	[{ id: 10, name: 'John' }, { id: 1, name: undefined, age: 23 }],
	(newValue, oldValue) => newValue.id === oldValue.id,
)

// After update:
// { id:  1, name: null,   age: 23 }
// { id:  2, name: null,   age: 30 }
// { id: 10, name: 'John', age: 25 }
```

## Introspection

Each `SQLTable` exposes read-only metadata:

```ts
table.name      // 'users'
table.columns   // ['id', 'name', 'createdAt']
table.rowCount  // 42
table.schema    // { id: { type: 'Number', autoIncrement: true }, name: { type: 'String' }, ... }
```

## Exports

```ts
import {
	SQLTable,
	DataTypes,
	// types
	type Schema,
	type ColumnsConfig,
	type InferRow,
	type InsertRow,
	type MergeJoins,
	type Nullable,
} from 'sql-client'
```

## License

MIT License
