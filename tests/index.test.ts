import { DataTypes, SQLDatabase, SQLTable } from '../src/index'
import { describe, beforeEach, it, expect } from 'vitest'

describe('Custom In-Memory SQL Engine', () => {
    let usersTable: SQLTable
    let postsTable: SQLTable
    let db: SQLDatabase
    beforeEach(() => {
        usersTable = new SQLTable('users', [
            { name: 'id', type: DataTypes.Number, autoIncrease: true },
            { name: 'username', type: DataTypes.String },
            { name: 'role', type: DataTypes.String },
            { name: 'score', type: DataTypes.Number } // No auto-increase
        ])

        postsTable = new SQLTable('posts', [
            { name: 'id', type: DataTypes.Number, autoIncrease: true },
            { name: 'authorId', type: DataTypes.Number },
            { name: 'title', type: DataTypes.String }
        ])

        db = new SQLDatabase(usersTable, postsTable)
    })

    describe('1. Introspection & Schema', () => {
        it('should correctly report table names and row counts', () => {
            expect(db.tableNames).toEqual(['users', 'posts'])
            expect(usersTable.rowCount).toBe(0)
            expect(usersTable.schema).toEqual({
                id: { type: 'Number', autoIncrease: true },
                username: { type: 'String' },
                role: { type: 'String' },
                score: { type: 'Number' }
            })
        })
    })

    describe('2. Insert & Auto-Increment Edge Cases', () => {
        it('should auto-generate IDs if omitted, and handle bulk inserts', () => {
            const results = usersTable.insert([
                { username: 'Alice', role: 'Admin' },
                { username: 'Bob', role: 'User' }
            ])
            expect(results[0]?.id).toBe(1)
            expect(results[1]?.id).toBe(2)
            expect(usersTable.rowCount).toBe(2)
        })

        it('should accept a manual ID and bump the auto-increment tracker correctly', () => {
            // Edge Case: User manually forces an ID of 100
            usersTable.insert({ id: 100, username: 'Charlie' })

            // The next automatic insert should be 101, NOT 1
            const nextResult = usersTable.insert({ username: 'Dave' })
            expect(nextResult[0]?.id).toBe(101)
        })

        it('should safely handle inserting explicit nulls', () => {
            const result = usersTable.insert({ username: 'Eve', role: null, score: null })
            expect(result[0]?.role).toBeNull()
            expect(result[0]?.score).toBeNull()
        })
    })

    describe('3. Query & Filtering Edge Cases', () => {
        beforeEach(() => {
            usersTable.insert([
                { username: 'Alice', role: 'Admin', score: 100 },
                { username: 'Bob', role: 'User', score: 50 },
                { username: 'Charlie', role: 'User', score: 50 },
                { username: 'NullBoy', role: null, score: null }
            ])
        })

        it('should respect limits and DISTINCT clauses', () => {
            const distinctRoles = usersTable.query({
                columns: [{ name: 'role', distinct: true }]
            })

            // Should only return Admin, User, and null (no duplicate 'User')
            expect(distinctRoles.length).toBe(3)
        })

        it('should evaluate the Lazy Proxy WHERE clause correctly', () => {
            const highScorers = usersTable.query({
                where: (row) => (row.score as number) > 60
            })
            expect(highScorers.length).toBe(1)
            expect(highScorers[0]?.username).toBe('Alice')
        })

        it('should sort correctly, putting NULLs in their proper place', () => {
            const sorted = usersTable.query({
                orderBy: 'score',
                orderMode: 'ASC',
                columns: [{ name: 'username' }, { name: 'score' }]
            })

            // ASC sorting should put NULL first, then 50, then 100
            expect(sorted[0]?.score).toBeNull()
            expect(sorted[1]?.score).toBe(50)
            expect(sorted[sorted.length - 1]?.score).toBe(100)
        })
    })

    describe('4. Nested-Loop Join Edge Cases', () => {
        it('should successfully join tables and handle non-matches safely', () => {
            usersTable.insert({ id: 1, username: 'Alice' })
            usersTable.insert({ id: 2, username: 'Bob' }) // Bob has no posts

            postsTable.insert({ id: 10, authorId: 1, title: 'Hello World' })

            const joined = usersTable.query({
                join: [{
                    table: 'posts',
                    on: (user, post) => user.id === post.authorId
                }]
            })

            // Only Alice should be returned because Bob has no matching posts (Inner Join behavior)
            expect(joined.length).toBe(1)
            expect(joined[0]?.username).toBe('Alice')
            expect(joined[0]?.title).toBe('Hello World')
        })
    })

    describe('5. Update & Bulk Update Edge Cases', () => {
        beforeEach(() => {
            usersTable.insert([
                { id: 1, username: 'Alice', score: 10 },
                { id: 2, username: 'Bob', score: 20 },
                { id: 3, username: 'Charlie', score: 30 }
            ])
        })

        it('should run bulk updates using the shrinking array optimization', () => {
            const updatedCount = usersTable.update(
                [
                    { score: 99 }, // Payload 1: Change Alice's score
                    { score: 88 }  // Payload 2: Change Bob's score
                ],
                (payload, row) => {
                    // Match Alice for payload 1, Bob for payload 2
                    if (payload.score === 99) return row.id === 1
                    if (payload.score === 88) return row.id === 2
                    return false
                }
            )

            expect(updatedCount).toBe(2)

            const verify = usersTable.query({ columns: [{ name: 'id'}, {name: 'score'}] })
            expect(verify.find(u => u.id === 1)?.score).toBe(99)
            expect(verify.find(u => u.id === 2)?.score).toBe(88)
            expect(verify.find(u => u.id === 3)?.score).toBe(30) // Charlie untouched
        })

        it('should safely bump auto-increment tracker if ID is updated', () => {
            usersTable.update([{ id: 50 }], (payload, row) => row.id === 3)

            // Next insert should be 51
            const result = usersTable.insert({ username: 'Dave' })
            expect(result[0]?.id).toBe(51)
        })
    })

    describe('6. Delete Edge Cases', () => {
        it('should correctly delete rows and respect the limit parameter', () => {
            usersTable.insert([
                { username: 'Clone' },
                { username: 'Clone' },
                { username: 'Clone' }
            ])

            // Edge Case: Limit the delete to only 2 rows, even though 3 match
            const deletedCount = usersTable.delete({
                where: (row) => row.username === 'Clone',
                limit: 2
            })

            expect(deletedCount).toBe(2)
            expect(usersTable.rowCount).toBe(1) // One clone survives
        })
    })

    describe('7. Advanced Edge Cases & Falsy Boundaries', () => {
        it('should handle 1-to-Many JOINS correctly (Cartesian Expansion)', () => {
            usersTable.insert({ id: 1, username: 'Author' })

            // One user, THREE posts
            postsTable.insert([
                { id: 10, authorId: 1, title: 'Post A' },
                { id: 11, authorId: 1, title: 'Post B' },
                { id: 12, authorId: 1, title: 'Post C' }
            ])

            const joined = usersTable.query({
                join: [{
                    table: 'posts',
                    on: (user, post) => user.id === post.authorId
                }]
            })

            // The engine should duplicate the user data for each matched post
            expect(joined.length).toBe(3)
            expect(joined[0]?.title).toBe('Post A')
            expect(joined[2]?.title).toBe('Post C')
            expect(joined[2]?.username).toBe('Author')
        })

        it('should execute complex Date methods inside the Lazy Proxy', () => {
            const eventsTable = new SQLTable('events', [
                { name: 'id', type: DataTypes.Number, autoIncrease: true },
                { name: 'eventName', type: DataTypes.String },
                { name: 'createdAt', type: DataTypes.Datetime }
            ])
            db = new SQLDatabase(eventsTable) // Mount to DB

            eventsTable.insert([
                { eventName: 'Old Event', createdAt: new Date('2020-05-15') },
                { eventName: 'New Event', createdAt: new Date('2026-01-01') }
            ])

            // Test if the Proxy safely constructs the Date object on the fly
            const results = eventsTable.query({
                where: (row) => (row.createdAt as Date).getFullYear() === 2026
            })

            expect(results.length).toBe(1)
            expect(results[0]?.eventName).toBe('New Event')
        })

        it('should distinguish between 0, empty string "", and null', () => {
            usersTable.insert([
                { username: '', score: 0 },         // Falsy but valid values
                { username: null, score: null }     // Actual nulls
            ])

            const zeroScore = usersTable.query({ where: (row) => row.score === 0 })
            const emptyName = usersTable.query({ where: (row) => row.username === '' })
            const nullScore = usersTable.query({ where: (row) => row.score === null })

            expect(zeroScore.length).toBe(1)
            expect(zeroScore[0]?.username).toBe('') // Empty string is preserved

            expect(emptyName.length).toBe(1)
            expect(emptyName[0]?.score).toBe(0) // Zero is preserved

            expect(nullScore.length).toBe(1)
            expect(nullScore[0]?.username).toBeNull()
        })

        it('should not throw errors when updating a string to the exact same string', () => {
            usersTable.insert({ id: 99, username: 'StableString' })

            // Update the string to what it already is
            // This tests the `if (oldString !== newValue)` optimization block
            const updated = usersTable.update(
                [{ username: 'StableString' }],
                (payload, row) => row.id === 99
            )

            expect(updated).toBe(1)
            const check = usersTable.query({ where: r => r.id === 99 })
            expect(check[0]?.username).toBe('StableString')
        })
    })
})