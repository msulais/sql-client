import { DataTypes, SQLTable } from '../index'
import { describe, beforeEach, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Helpers — factory functions so each test gets a clean table
// ---------------------------------------------------------------------------

function makeUsers() {
	return new SQLTable<{
		id: number
		username: string | null
		role: string | null
		score: number | null
	}>({
		id:       { type: DataTypes.Number, autoIncrement: true },
		username: { type: DataTypes.String,  nullable: true },
		role:     { type: DataTypes.String,  nullable: true },
		score:    { type: DataTypes.Number,  nullable: true },
	})
}

function makePosts() {
	return new SQLTable<{
		id: number
		authorId: number
		title: string
	}>({
		id:       { type: DataTypes.Number, autoIncrement: true },
		authorId: { type: DataTypes.Number },
		title:    { type: DataTypes.String },
	})
}

function makeEvents() {
	return new SQLTable<{
		id: number
		name: string
		createdAt: Date
	}>({
		id:        { type: DataTypes.Number,   autoIncrement: true },
		name:      { type: DataTypes.String },
		createdAt: { type: DataTypes.Datetime },
	})
}

// ---------------------------------------------------------------------------
// 1. Introspection
// ---------------------------------------------------------------------------

describe('1. Introspection', () => {
	it('reports columns in definition order', () => {
		expect(makeUsers().columns).toEqual(['id', 'username', 'role', 'score'])
	})

	it('starts with rowCount = 0', () => {
		expect(makeUsers().rowCount).toBe(0)
	})

	it('schema includes correct types and autoIncrement flag', () => {
		expect(makeUsers().schema).toEqual({
			id:       { type: 'Number', autoIncrement: true },
			username: { type: 'String' },
			role:     { type: 'String' },
			score:    { type: 'Number' },
		})
	})

	it('schema shows Datetime type', () => {
		expect(makeEvents().schema.createdAt).toEqual({ type: 'Datetime' })
	})
})

// ---------------------------------------------------------------------------
// 2. Insert — basic behaviour
// ---------------------------------------------------------------------------

describe('2. Insert — basic', () => {
	let users: ReturnType<typeof makeUsers>

	beforeEach(() => { users = makeUsers() })

	it('inserts a single row and returns it hydrated', () => {
		const [row] = users.insert({ username: 'Alice', role: 'Admin', score: 100, id: -1 })
		expect(row?.id).toBe(1)
		expect(row?.username).toBe('Alice')
		expect(row?.role).toBe('Admin')
		expect(row?.score).toBe(100)
		expect(users.rowCount).toBe(1)
	})

	it('inserts an array of rows and returns all hydrated', () => {
		const rows = users.insert([{ id: -1, role: null, score: null, username: 'Alice' }, { id: -1, role: null, score: null, username: 'Bob' }])
		expect(rows.length).toBe(2)
		expect(users.rowCount).toBe(2)
	})

	it('stores null for nullable columns', () => {
		const [row] = users.insert({ username: 'Eve', role: null, score: null, id: -1 })
		expect(row?.role).toBeNull()
		expect(row?.score).toBeNull()
	})

	it('stores and retrieves a Date value correctly', () => {
		const events = makeEvents()
		const date = new Date('2025-06-15T12:00:00Z')
		const [row] = events.insert({ name: 'Launch', createdAt: date, id: -1 })
		expect(row?.createdAt).toBeInstanceOf(Date)
		expect((row?.createdAt as Date).toISOString()).toBe(date.toISOString())
	})

	it('preserves falsy-but-valid values: 0 and empty string', () => {
		const [row] = users.insert({ username: '', score: 0, id: -1, role: null })
		expect(row?.username).toBe('')
		expect(row?.score).toBe(0)
	})
})

// ---------------------------------------------------------------------------
// 3. Insert — auto-increment
// ---------------------------------------------------------------------------

describe('3. Insert — auto-increment', () => {
	let users: ReturnType<typeof makeUsers>

	beforeEach(() => { users = makeUsers() })

	it('auto-increments id when omitted', () => {
		const [a, b] = users.insert([{ username: 'A', id: -1, role: null, score: null }, { username: 'B', id: -1, role: null, score: null }])
		expect(a?.id).toBe(1)
		expect(b?.id).toBe(2)
	})

	it('bumps the counter when an explicit id is given, so next auto = id + 1', () => {
		users.insert({ id: 100, username: 'Charlie', role: null, score: null })
		const [next] = users.insert({ username: 'Dave', id: -1, role: null, score: null })
		expect(next?.id).toBe(101)
	})

	it('sentinel -1 triggers auto-increment on the very first insert', () => {
		const [row] = users.insert({ id: -1, username: 'Sentinel', role: null, score: null })
		expect(row?.id).toBe(1)
	})

	it('consecutive -1 inserts each produce the next id in sequence', () => {
		const [a, b, c] = users.insert([
			{ id: -1, username: 'A', role: null, score: null },
			{ id: -1, username: 'B', role: null, score: null },
			{ id: -1, username: 'C', role: null, score: null },
		])
		expect(a?.id).toBe(1)
		expect(b?.id).toBe(2)
		expect(c?.id).toBe(3)
	})

	it('sentinel after explicit id 50 yields 51', () => {
		users.insert({ id: 50, username: 'High', role: null, score: null })
		const [row] = users.insert({ id: -1, username: 'Next', role: null, score: null })
		expect(row?.id).toBe(51)
	})

	it('any value below or same as the current counter is treated as a sentinel', () => {
		users.insert({ id: 10, role: null, score: null, username: 'A' }) // counter → 10
		const [row] = users.insert({ id: 5, role: null, score: null, username: 'B' }) // 5 < 10 → sentinel → 11
		expect(row?.id).toBe(11)
		const [row2] = users.insert({ id: 11, role: null, score: null, username: 'B' })
		expect(row2?.id).toBe(12)
	})
})

// ---------------------------------------------------------------------------
// 4. Insert — UPSERT / conflict
// ---------------------------------------------------------------------------

describe('4. Insert — UPSERT', () => {
	let users: ReturnType<typeof makeUsers>

	beforeEach(() => { users = makeUsers() })

	it('updates the existing row when conflictKey matches', () => {
		users.insert({ id: -1, username: 'Alice', role: 'User', score: 10 })
		const results = users.insert({ id: -1, username: 'Alice', role: 'Admin', score: 99 }, 'username')
		expect(results.length).toBe(1)
		expect(results[0]?.role).toBe('Admin')
		expect(results[0]?.score).toBe(99)
		expect(users.rowCount).toBe(1)
	})

	it('inserts as a new row when conflictKey has no match', () => {
		const results = users.insert({ id: -1, role: null, username: 'Newcomer', score: 50 }, 'username')
		expect(results.length).toBe(1)
		expect(results[0]?.username).toBe('Newcomer')
		expect(users.rowCount).toBe(1)
	})

	it('onConflict callback can veto an update (row stays unchanged)', () => {
		users.insert([{ id: -1, role: null, username: 'P1', score: 100 }, { id: -1, role: null, username: 'P2', score: 100 }])

		const results = users.insert(
			[
				{ id: -1, role: null, username: 'P1', score: 150 }, // higher → update allowed
				{ id: -1, role: null, username: 'P2', score: 50  }, // lower  → vetoed
			],
			'username',
			(payload, old) => (payload.score as number) > (old.score as number)
		)

		expect(results.length).toBe(1)
		expect(results[0]?.username).toBe('P1')
		expect(results[0]?.score).toBe(150)

		const p2 = users.query({ where: r => r.username === 'P2' })
		expect(p2[0]?.score).toBe(100) // unchanged
		expect(users.rowCount).toBe(2)
	})

	it('handles a batch of mixed inserts and updates in one call', () => {
		users.insert([{ id: -1, role: null, username: 'A', score: 1 }, { id: -1, role: null, username: 'B', score: 2 }])

		const results = users.insert(
			[
				{ id: -1, role: null, username: 'A', score: 99 }, // update
				{ id: -1, role: null, username: 'B', score: 88 }, // update
				{ id: -1, role: null, username: 'C', score: 77 }, // insert
			],
			'username'
		)

		expect(results.length).toBe(3)
		expect(users.rowCount).toBe(3)

		const all = users.query({ orderBy: 'username', orderDirection: 'ASC' })
		expect(all[0]?.score).toBe(99)
		expect(all[1]?.score).toBe(88)
		expect(all[2]?.score).toBe(77)
	})

	it('onUpdateMap transforms the payload before it is applied', () => {
		users.insert({ id: -1, role: null, username: 'Alice', score: 10 })

		const results = users.insert(
			{ id: -1, role: null, username: 'Alice', score: 0 },
			'username',
			undefined,
			(payload, old) => ({ ...payload, score: (old.score as number) + 5 })
		)

		expect(results[0]?.score).toBe(15) // 10 + 5
	})
})

// ---------------------------------------------------------------------------
// 5. Query — filtering & projection
// ---------------------------------------------------------------------------

describe('5. Query — filtering & projection', () => {
	let users: ReturnType<typeof makeUsers>

	beforeEach(() => {
		users = makeUsers()
		users.insert([
			{ id: -1, username: 'Alice',   role: 'Admin', score: 100 },
			{ id: -1, username: 'Bob',     role: 'User',  score: 50  },
			{ id: -1, username: 'Charlie', role: 'User',  score: 50  },
			{ id: -1, username: 'NullBot', role: null,    score: null },
		])
	})

	it('returns all rows when called with no options', () => {
		expect(users.query().length).toBe(4)
	})

	it('WHERE filters rows correctly via lazy proxy', () => {
		const result = users.query({ where: r => (r.score as number) > 60 })
		expect(result.length).toBe(1)
		expect(result[0]?.username).toBe('Alice')
	})

	it('WHERE can match on null', () => {
		const result = users.query({ where: r => r.role === null })
		expect(result.length).toBe(1)
		expect(result[0]?.username).toBe('NullBot')
	})

	it('DISTINCT on a column eliminates duplicates, keeping nulls', () => {
		const result = users.query({ columns: [{ name: 'role', distinct: true }] })
		// Roles: 'Admin', 'User', 'User', null → deduplicated = 3
		expect(result.length).toBe(3)
	})

	it('columns projection omits unrequested fields', () => {
		const result = users.query({ columns: [{ name: 'username' }] })
		expect(result[0]).toHaveProperty('username')
		expect(result[0]).not.toHaveProperty('score')
	})

	it('lazy proxy supports calling Date methods inside WHERE', () => {
		const events = makeEvents()
		events.insert([
			{ id: -1, name: 'Old', createdAt: new Date('2020-01-01') },
			{ id: -1, name: 'New', createdAt: new Date('2026-06-01') },
		])

		const result = events.query({
			where: r => (r.createdAt as Date).getFullYear() === 2026,
		})
		expect(result.length).toBe(1)
		expect(result[0]?.name).toBe('New')
	})

	it('distinguishes 0, empty string, and null correctly', () => {
		users.insert([
			{ id: -1, username: '',   score: 0, role: null    },
			{ id: -1, username: null, score: null, role: null },
		])

		expect(users.query({ where: r => r.score === 0     }).length).toBe(1)
		expect(users.query({ where: r => r.username === '' }).length).toBe(1)
		// Two rows with null score: NullBot + the new null row
		expect(users.query({ where: r => r.score === null  }).length).toBe(2)
	})
})

// ---------------------------------------------------------------------------
// 6. Query — sorting
// ---------------------------------------------------------------------------

describe('6. Query — sorting', () => {
	let users: ReturnType<typeof makeUsers>

	beforeEach(() => {
		users = makeUsers()
		users.insert([
			{ id: -1, username: 'Charlie', score: 30, role: null   },
			{ id: -1, username: 'Alice',   score: 100, role: null  },
			{ id: -1, username: 'Bob',     score: 50, role: null   },
			{ id: -1, username: 'NullBot', score: null, role: null },
		])
	})

	it('ORDER BY number ASC — nulls sort first', () => {
		const result = users.query({ orderBy: 'score', orderDirection: 'ASC' })
		expect(result[0]?.score).toBeNull()
		expect(result[1]?.score).toBe(30)
		expect(result[result.length - 1]?.score).toBe(100)
	})

	it('ORDER BY number DESC — nulls sort last', () => {
		const result = users.query({ orderBy: 'score', orderDirection: 'DESC' })
		expect(result[0]?.score).toBe(100)
		expect(result[result.length - 1]?.score).toBeNull()
	})

	it('ORDER BY string ASC uses locale order', () => {
		const result = users.query({ orderBy: 'username', orderDirection: 'ASC' })
		expect(result[0]?.username).toBe('Alice')
		expect(result[1]?.username).toBe('Bob')
	})

	it('ORDER BY is applied across the full dataset before LIMIT is cut', () => {
		users.insert({ username: 'Dave', score: 80, id: -1, role: null })
		const top2 = users.query({ orderBy: 'score', orderDirection: 'DESC', limit: 2 })
		expect(top2.length).toBe(2)
		expect(top2[0]?.username).toBe('Alice') // score 100
		expect(top2[1]?.username).toBe('Dave')  // score 80
	})

	it('ORDER BY Date DESC', () => {
		const events = makeEvents()
		events.insert([
			{ id: -1, name: 'Old', createdAt: new Date('2020-01-01') },
			{ id: -1, name: 'New', createdAt: new Date('2026-01-01') },
			{ id: -1, name: 'Mid', createdAt: new Date('2023-06-01') },
		])
		const result = events.query({ orderBy: 'createdAt', orderDirection: 'DESC' })
		expect(result[0]?.name).toBe('Old')
		expect(result[result.length - 1]?.name).toBe('New')
	})
})

// ---------------------------------------------------------------------------
// 7. Query — limit & offset
// ---------------------------------------------------------------------------

describe('7. Query — limit & offset', () => {
	let users: ReturnType<typeof makeUsers>

	beforeEach(() => {
		users = makeUsers()
		users.insert([
			{ id: -1, username: 'User1', score: 10, role: null },
			{ id: -1, username: 'User2', score: 20, role: null },
			{ id: -1, username: 'User3', score: 30, role: null },
			{ id: -1, username: 'User4', score: 40, role: null },
			{ id: -1, username: 'User5', score: 50, role: null },
		])
	})

	it('LIMIT caps the number of returned rows', () => {
		expect(users.query({ limit: 2 }).length).toBe(2)
	})

	it('OFFSET skips rows from the beginning', () => {
		const result = users.query({ offset: 2 })
		expect(result.length).toBe(3)
		expect(result[0]?.username).toBe('User3')
		expect(result[2]?.username).toBe('User5')
	})

	it('LIMIT + OFFSET returns the correct window', () => {
		const result = users.query({ offset: 1, limit: 2 })
		expect(result.length).toBe(2)
		expect(result[0]?.username).toBe('User2')
		expect(result[1]?.username).toBe('User3')
	})

	it('OFFSET is applied after ORDER BY', () => {
		// DESC: User5 User4 User3 User2 User1 — offset 2, limit 2 → User3, User2
		const result = users.query({
			orderBy: 'score',
			orderDirection: 'DESC',
			offset: 2,
			limit: 2,
		})
		expect(result.length).toBe(2)
		expect(result[0]?.username).toBe('User3')
		expect(result[1]?.username).toBe('User2')
	})

	it('WHERE is evaluated before OFFSET', () => {
		// scores > 15 → User2 User3 User4 User5, offset 1 limit 2 → User3 User4
		const result = users.query({
			where: r => (r.score as number) > 15,
			offset: 1,
			limit: 2,
		})
		expect(result.length).toBe(2)
		expect(result[0]?.username).toBe('User3')
		expect(result[1]?.username).toBe('User4')
	})

	it('returns empty array when OFFSET exceeds dataset size', () => {
		expect(users.query({ offset: 100 }).length).toBe(0)
	})
})

// ---------------------------------------------------------------------------
// 8. Query — JOIN
// ---------------------------------------------------------------------------

describe('8. Query — JOIN', () => {
	let users: ReturnType<typeof makeUsers>
	let posts: ReturnType<typeof makePosts>

	beforeEach(() => {
		users = makeUsers()
		posts = makePosts()
	})

	it('INNER JOIN excludes outer rows that have no match', () => {
		users.insert([{ id: 1, username: 'Alice', role: null, score: null }, { id: 2, username: 'Bob', role: null, score: null }])
		posts.insert({ id: 10, authorId: 1, title: 'Hello World' })

		const result = users.query({
			join: [{ table: posts, on: (u, p) => u.id === p.authorId }],
		})

		expect(result.length).toBe(1)
		expect(result[0]?.username).toBe('Alice')
		expect(result[0]?.title).toBe('Hello World')
	})

	it('1-to-Many JOIN expands one outer row into multiple combined rows', () => {
		users.insert({ id: 1, username: 'Author', role: null, score: null })
		posts.insert([
			{ id: 10, authorId: 1, title: 'Post A' },
			{ id: 11, authorId: 1, title: 'Post B' },
			{ id: 12, authorId: 1, title: 'Post C' },
		])

		const result = users.query({
			join: [{ table: posts, on: (u, p) => u.id === p.authorId }],
		})

		expect(result.length).toBe(3)
		expect(result[0]?.title).toBe('Post A')
		expect(result[2]?.title).toBe('Post C')
		expect(result[2]?.username).toBe('Author')
	})

	it('JOIN with columns projection includes only selected join-table columns', () => {
		users.insert({ id: 1, username: 'Alice', role: null, score: null })
		posts.insert({ id: 10, authorId: 1, title: 'My Post' })

		const result = users.query({
			join: [{ table: posts, columns: ['title'], on: (u, p) => u.id === p.authorId }],
		})

		expect(result[0]).toHaveProperty('title')
		expect(result[0]).not.toHaveProperty('authorId')
	})
})

// ---------------------------------------------------------------------------
// 9. Update
// ---------------------------------------------------------------------------

describe('9. Update', () => {
	let users: ReturnType<typeof makeUsers>

	beforeEach(() => {
		users = makeUsers()
		users.insert([
			{ id: 1, username: 'Alice',   score: 10, role: null },
			{ id: 2, username: 'Bob',     score: 20, role: null },
			{ id: 3, username: 'Charlie', score: 30, role: null },
		])
	})

	it('updates a single matching row and returns it hydrated', () => {
		const result = users.update([{ score: 99 }], (_, row) => row.id === 1)
		expect(result.length).toBe(1)
		expect(result[0]?.score).toBe(99)
		expect(users.query({ where: r => r.id === 1 })[0]?.score).toBe(99)
	})

	it('bulk update: each payload matches one row', () => {
		const result = users.update(
			[{ score: 99 }, { score: 88 }],
			(payload, row) => {
				if (payload.score === 99) return row.id === 1
				if (payload.score === 88) return row.id === 2
				return false
			}
		)

		expect(result.length).toBe(2)
		// Charlie (id 3) must be untouched
		expect(users.query({ where: r => r.id === 3 })[0]?.score).toBe(30)
	})

	it('multiple update payloads targeting the same row apply all modifications sequentially', () => {
		const result = users.update([
			{ id: 1, score: 20 }, // first change
			{ id: 1, username: 'D' }, // second change
		], (newV, oldV) => newV.id === oldV.id)

		expect(result.length).toBe(1) // Row should only be returned once
		expect(result[0]?.score).toBe(20)
		expect(result[0]?.username).toBe('D')

		const queried = users.query({ where: r => r.id === 1 })
		expect(queried[0]?.score).toBe(20)
		expect(queried[0]?.username).toBe('D')
	})

	it('map function transforms the payload before it is written', () => {
		const result = users.update(
			[{ score: 0 }],
			(_, row) => row.username === 'Alice',
			(payload, row) => ({ ...payload, score: (row.score as number) + 15 })
		)
		expect(result[0]?.score).toBe(25) // 10 + 15
	})

	it('updating a string to the same value is a no-op (ref count unchanged)', () => {
		const result = users.update([{ username: 'Alice' }], (_, row) => row.id === 1)
		expect(result.length).toBe(1)
		expect(result[0]?.username).toBe('Alice')
	})

	it('updating a string column to null nullifies it', () => {
		const result = users.update([{ username: null }], (_, row) => row.id === 1)
		expect(result[0]?.username).toBeNull()
		expect(users.query({ where: r => r.id === 1 })[0]?.username).toBeNull()
	})

	it('bumps auto-increment tracker when id is updated to a higher value', () => {
		users.update([{ id: 50 }], (_, row) => row.id === 3)
		const [next] = users.insert({ username: 'Dave', id: -1, role: null, score: null })
		expect(next?.id).toBe(51)
	})

	it('returns empty array when no rows match', () => {
		expect(users.update([{ score: 0 }], (_, row) => row.id === 999).length).toBe(0)
	})
})

// ---------------------------------------------------------------------------
// 10. Delete
// ---------------------------------------------------------------------------

describe('10. Delete', () => {
	let users: ReturnType<typeof makeUsers>

	beforeEach(() => {
		users = makeUsers()
		users.insert([
			{ id: -1, username: 'Alice', role: 'Admin', score: 100 },
			{ id: -1, username: 'Bob',   role: 'User',  score: 50  },
			{ id: -1, username: 'Clone', role: 'User',  score: 10  },
			{ id: -1, username: 'Clone', role: 'User',  score: 10  },
			{ id: -1, username: 'Clone', role: 'User',  score: 10  },
		])
	})

	it('deletes all rows when called with no options', () => {
		expect(users.delete().length).toBe(5)
		expect(users.rowCount).toBe(0)
	})

	it('WHERE limits which rows are deleted', () => {
		users.delete({ where: r => r.username === 'Alice' })
		expect(users.rowCount).toBe(4)
		expect(users.query({ where: r => r.username === 'Alice' }).length).toBe(0)
	})

	it('LIMIT caps how many matching rows are deleted', () => {
		const deleted = users.delete({ where: r => r.username === 'Clone', limit: 2 })
		expect(deleted.length).toBe(2)
		expect(users.rowCount).toBe(3) // Alice + Bob + 1 surviving Clone
	})

	it('returns correctly hydrated data for deleted rows', () => {
		const [row] = users.delete({ where: r => r.username === 'Alice' })
		expect(row?.username).toBe('Alice')
		expect(row?.role).toBe('Admin')
		expect(row?.score).toBe(100)
	})

	it('returns empty array when no rows match the WHERE clause', () => {
		expect(users.delete({ where: r => r.username === 'Nobody' }).length).toBe(0)
		expect(users.rowCount).toBe(5)
	})

	it('returns empty array on an already-empty table', () => {
		expect(makeUsers().delete()).toEqual([])
	})

	it('deleted rows are no longer returned by subsequent queries', () => {
		users.delete({ where: r => r.username === 'Bob' })
		expect(users.query({ where: r => r.username === 'Bob' }).length).toBe(0)
	})
})