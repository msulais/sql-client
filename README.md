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
    { name: 'id', type: DataTypes.Number, autoIncrease: true },
    { name: 'name', type: DataTypes.String },
    { name: 'createdAt', type: DataTypes.Datetime }
]);

const postsTable = new SQLTable<PostSchema>('posts', [
    { name: 'id', type: DataTypes.Number, autoIncrease: true },
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

// 4. Connect table to enable JOIN operation
usersTable.connect([postsTable])

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

// This is not needed. But you can automatically connect all table.
const db = new SQLDatabase(usersTable, postsTable);
```

## 📄 License

MIT License