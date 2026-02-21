# 🗄️ sql-client

A lightweight, in-memory SQL-like database system written in TypeScript. It features memory optimization through a shared string pool, automatic hydration of data types, and relational table joining capabilities.

## ✨ Features

* **Zero Dependencies:** Pure TypeScript/JavaScript. No WASM, no binaries, no setup.
* **Insanely Memory Efficient:** Uses **String Interning** (a shared memory pool) to store duplicate strings as tiny integer pointers.
* **Raw Arrays:** Rows are stored as contiguous arrays of numbers (e.g., `[1, 42, 1708500000]`).
* **Garbage-Collection Optimized:** Uses **Late Materialization** via JS Proxies. Your `WHERE` clauses are evaluated against raw memory arrays *before* objects are instantiated, preventing UI-freezing GC pauses on large datasets.
* **Relational Power:** Supports complex nested-loop `JOIN`s across multiple tables.
* **Fully Typed:** Built-in generic types for fantastic developer experience and autocomplete.

## 📦 Installation

```bash
# Using npm
npm install sql-client

# Using pnpm
pnpm add sql-client

# Using JSR
npx jsr add @biru/sql-client
```

## 📝 Usage Example

The following example demonstrates how to define tables, initialize the database, insert records, and query relational data using a join.

```ts
import { SQLTable, SQLDatabase, DataTypes } from 'sql-client';

// 1. Define your table schemas
type UserSchema = { id: number; name: string; createdAt: Date };
type PostSchema = { id: number; authorId: number; title: string };

// 2. Create table instances
const usersTable = new SQLTable<UserSchema>('users', [
    { name: 'id', type: DataTypes.Number, autoIncrease: true },
    { name: 'name', type: DataTypes.String },
    { name: 'createdAt', type: DataTypes.Datetime }
]);

const postsTable = new SQLTable<PostSchema>('posts', [
    { name: 'id', type: DataTypes.Number, autoIncrease: true },
    { name: 'authorId', type: DataTypes.Number },
    { name: 'title', type: DataTypes.String }
]);

// 3. Initialize the database and connect the tables
const db = new SQLDatabase(usersTable, postsTable);

// 4. Insert data
usersTable.insert([
    { name: 'Alice', createdAt: new Date() },
    { name: 'Bob', createdAt: new Date() }
]); // Alice gets id: 1, Bob gets id: 2

postsTable.insert([
    { authorId: 1, title: 'Introduction to TypeScript' },
    { authorId: 1, title: 'Advanced Memory Management' },
    { authorId: 2, title: 'SQL Joins Explained' }
]);

// 5. Query data with a Join
// Let's get all posts written by Alice
const alicePosts = usersTable.query<PostSchema>({
    where: (user) => user.name === 'Alice',
    join: [{
        table: 'posts',
        on: (user, post) => user.id === post.authorId
    }]
});

console.log(alicePosts);
/* Output will merge the user and post properties:
[
  { id: 1, name: 'Alice', createdAt: 2026-02-21T..., authorId: 1, title: 'Introduction to TypeScript' },
  { id: 2, name: 'Alice', createdAt: 2026-02-21T..., authorId: 1, title: 'Advanced Memory Management' }
]
*/
```

## 📖 API References

### DataTypes

Defines the supported data types for table columns.

* `DataTypes.Number`
* `DataTypes.String`
* `DataTypes.Datetime`

### SQLDatabase

Represents a collection of connected `SQLTable` instances, facilitating cross-table operations like joins.

#### Constructor

```ts
new SQLDatabase(...tables: SQLTable[])
```

* `tables`: A spread of `SQLTable` instances to register and link together.

#### Properties

* `tableNames: string[]` (*Read-only*)

    Retrieves a registered table instance by its name. Returns `undefined` if the table does not exist.

#### Methods

* `getTable<T>(name: string): SQLTable<T> | undefined`

    Retrieves a registered table instance by its name. Returns `undefined` if the table does not exist.

### SQLTable<T>

Represents a single table storing rows of data. Handles internal memory optimization and data type coercion.

#### Constructor

```ts
new SQLTable<T extends Record<string, string | number | date | null>>(name: string, columns: Column<T>[])
```

* `name`: The name of the table.
* `columns`: An array defining the schema (e.g., `{ name: 'id', type: DataTypes.Number, autoIncrease: true }`).

#### Properties

* `name: string` (*Read-only*) - The name of the table.
* `columns: string[]` (*Read-only*) - An array of the column names.
* `rowCount: number` (*Read-only*) - The total number of rows currently stored.
* `schema: Record<string, ColumnProperties>` (*Read-only*) - Returns a human-readable schema object detailing column types and `autoIncrease` status.

#### Methods

* `insert(values: Partial<T> | Partial<T>[]): T[]`

    Inserts one or more rows into the table. Missing columns will be set to null unless they are marked as autoIncrease.

    * `values`: A single row object or an array of row objects.
    * Returns: An array of the newly inserted, fully hydrated row objects.

* `query<U>(options?: QueryOptions): (T & U)[]`

    Queries the table for data. Supports filtering, inner joins, sorting, and limiting results.

    Generic type `U` is another `Schema` of another `SQLTable`. Useful for joining table.

    * `options.limit` (`number`): Maximum rows to return.
    * `options.where` (`(row: T) => boolean`): A callback function to filter rows.
    * `options.orderBy` (`string`): The column name to sort by.
    * `options.orderMode` (`'ASC' | 'DESC'`): Sort direction.
    * `options.columns` (`{ name: string, distinct?: boolean }[]`): Specify which columns to return and apply distinct filtering.
    * `options.join` (`Array`): Configuration for joining with other tables. Requires table name, optional columns to pick, and an on callback for the join condition. Each array item record must follow:
        * `table:` (`string`): Table name to join.
        * `columns` (`string[]`) (*Optional*): Columns want to join. All if not assigned.
        * `on` (`(currentTableValue: T, joinTableValue: U) => boolean`): Join table condition.
    * Returns: An array of matching row objects.

* `update(values: Partial<T>[], where: (payload: T, oldRow: T) => boolean): number`

    Updates specific rows matching a condition. Automatically manages string pool references.

    * `values`: An array of update payloads.
    * `where`: A callback to determine if a specific payload should be applied to a specific row.
    * Returns: The total number of successful updates

* `delete(options?: { limit?: number, where?: (row: T) => boolean }): number`

    Removes rows from the table based on a condition and cleans up unused strings from memory.

    * `options.where`: A callback function determining which rows to delete.
    * `options.limit`: The maximum number of rows to delete.
    * Returns: The number of rows successfully deleted.

* `connectTables(tables: SQLTable[]): void`

    Connects other tables to this table instance to allow `query` to perform `join` operations. This is called automatically by the `SQLDatabase` constructor.

## 📄 License

MIT License