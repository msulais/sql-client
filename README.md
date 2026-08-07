# 🗄️ sql-client

A lightweight, in-memory SQL-like database system that run in browser and node js. It features memory optimization through a shared string pool, automatic hydration of data types, and relational table joining capabilities.

## ✨ Features

* **Zero Dependencies:** Pure TypeScript/JavaScript. No WASM, no binaries, no setup.
* **Insanely Memory Efficient:** Uses **String Interning** (a shared memory pool) to store duplicate strings as tiny integer pointers.
* **Raw Arrays:** Rows are stored as contiguous arrays of numbers (e.g., `[1, 42, 1708500000]`).
* **Garbage-Collection Optimized:** Uses **Late Materialization** via JS Proxies. Your `WHERE` clauses are evaluated against raw memory arrays *before* objects are instantiated, preventing UI-freezing GC pauses on large datasets.
* **Relational Power:** Supports complex nested-loop `JOIN`s across multiple tables.
* **Fully Typed:** Built-in generic types for fantastic developer experience and autocomplete.

## 📝 Usage Example

The following example demonstrates how to define tables, initialize the database, insert records, and query relational data using a join.

```ts
import { SQLTable, SQLDatabase, DataTypes } from 'sql-client';

// 1. Define your table schemas
type UserSchema = { id: number; name: string; createdAt: Date };
type PostSchema = { id: number; authorId: number; title: string };

// 2. Create table instances
const usersTable = new SQLTable<UserSchema>('users', [
    { name: 'id', type: DataTypes.Number, autoIncrement: true },
    { name: 'name', type: DataTypes.String },
    { name: 'createdAt', type: DataTypes.Datetime }
]);

const postsTable = new SQLTable<PostSchema>('posts', [
    { name: 'id', type: DataTypes.Number, autoIncrement: true },
    { name: 'authorId', type: DataTypes.Number },
    { name: 'title', type: DataTypes.String }
]);

// 3. Insert data
usersTable.insert([
    { name: 'Alice', createdAt: new Date() },
    { name: 'Bob', createdAt: new Date() }
]); // Alice gets id: 1, Bob gets id: 2

postsTable.insert([
    { authorId: 1, title: 'Introduction to TypeScript' },
    { authorId: 1, title: 'Advanced Memory Management' },
    { authorId: 2, title: 'SQL Joins Explained' }
]);

// 4. Query data with a Join
// Let's get all posts written by Alice
const alicePosts = usersTable.query<PostSchema>({
    where: (user) => user.name === 'Alice',
    join: [{
        table: postsTable,
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

## ⚠️ Nullability and `undefined`

By default, columns in `sql-client` are strictly typed and **cannot be null**. If you want a column to accept `null` values, you must explicitly set `nullable: true` in your column configurations and append `as const` to the array so TypeScript can accurately infer your types.

If you omit a value or set it to `undefined`, the behavior changes depending on the operation:

* `update()` will strictly **ignore** `undefined` values, allowing you to partially update only the fields you need.
* `insert()` will treat `undefined` (or omitted) values as an **auto-increment trigger** (if configured), or it will set it to `null` (if the column is nullable).

> **Note:** Attempting to insert `null` or `undefined` into a column that is not auto-incrementing and not explicitly flagged as `nullable: true` will cause a TypeScript warning.

```ts
import { SQLTable, DataTypes } from 'sql-client'

type User = {
    id: number
    name: string | null
    age: number
}

// 💡 Notice the 'as const' at the end!
// This is required for TypeScript to enforce your nullable flags.
const table = new SQLTable<User, any>('users', [
    { name: 'id'  , type: DataTypes.Number, autoIncrement: true },
    { name: 'name', type: DataTypes.String, nullable: true }, // Infers: string | null
    { name: 'age' , type: DataTypes.Number }                  // Infers: number
] as const)

table.insert([
    {
        // [id] omitted -> triggers auto-increment
        name: undefined, // becomes null
        age: 22          // required, since age is not nullable
    },
    {
        // [id] omitted -> triggers auto-increment
        name: null,      // explicitly null
        age: 30
    },
    {
        id: 10,          // manual ID assignment
        name: 'Irfan',
        age: 25
    }
])

// QUERY AFTER INSERT:
// { id:  1, name: null   , age: 22 }
// { id:  2, name: null   , age: 30 }
// { id: 10, name: 'Irfan', age: 25 }

table.update([
    {
        id: 10,
        name: 'John'
        // [age] omitted -> ignored, keeps the previous value (25)
    },
    {
        id: 1,
        name: undefined, // explicitly undefined -> ignored, keeps previous value (null)
        age: 23
    }
], (newValue, oldValue) => {
    return newValue.id === oldValue.id
})

// QUERY AFTER UPDATE:
// { id:  1, name: null  , age: 23 }
// { id:  2, name: null  , age: 30 }
// { id: 10, name: 'John', age: 25 }
```

## 📄 License

MIT License