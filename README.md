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

## ⚠️ `null` vs `undefined`

Every value in `sql-client` package always nullable. So `null` is always possible. If you set column
value to `undefined`, it will either *ignored* or set to *`null`* or *auto increment number*.

* `update()` will ignore `undefined` value so you can update only what you need.
* `insert()` will set `undefined` value as `null` or auto-increment number (if set).

```ts
import { SQLTable, DataTypes } from 'sql-client'

type User = {
    id: number
    name: string
    age: number
}

const table = new SQLTable<User>('users', [
    { name: 'id'  , type: DataTypes.Number, autoIncrement: true },
    { name: 'name', type: DataTypes.String },
    { name: 'age' , type: DataTypes.Number }
])

table.insert([
    {
        id: null, // auto increment
        name: undefined // become: null
        // [age] become null
    },
    {
        id: undefined, // auto increment
        name: null, // keep null
        age: undefined, // become null
    },
    {
        id: 10,
        name: 'Irfan',
        age: 22
    },
    {
        id: 11,
        name: 'Ryan',
        // [age] become null
    },
    {
        id: null, // auto increment
        name: 'Kevin',
        age: 50
    }
])

// QUERY AFTER INSERT:
// { id:  1, name: null   , age: null }
// { id:  2, name: null   , age: null }
// { id: 10, name: 'Irfan', age: 22   }
// { id: 11, name: 'Ryan' , age: null }
// { id: 12, name: 'Kevin', age: 50   }

table.update([
    {
        id: 10,
        name: 'John'
        // [age] ignored
    },
    {
        id: 11,
        name: undefined, // ignored
        age: 14
    },
    {
        id: 12,
        name: null, // not ignored
        // [age] ignored
    }
], (newValue, oldValue) => {
    return oldValue.id !== null && newValue.id === oldValue.id
})

// QUERY AFTER UPDATE:
// { id:  1, name: null  , age: null }
// { id:  2, name: null  , age: null }
// { id: 10, name: 'John', age: 22   }
// { id: 11, name: 'Ryan', age: 14   }
// { id: 12, name: null  , age: 50   }
```

## 📄 License

MIT License