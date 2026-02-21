/**
 * Defines the supported data types for table columns.
 */
export enum DataTypes {
	Number,
	String,
	Datetime,
}

type StringId = number
type ColumnIndex = number

/**
 * Column name
 */
export type ColumnName = string

/**
 * Table name
 */
export type TableName = string
export type Schema = Record<ColumnName, number | string | Date | null>
export type ColumnProperties<T extends Record<ColumnName, any>> = ({ name: keyof T } & (
	{ type: DataTypes.String | DataTypes.Datetime }
	| { type: DataTypes.Number, autoIncrease?: boolean }
))

// (2 string + 3 (8*3 Bytes) number) memory = each string
const SHARED_STRING = new Map<StringId, [value: string, lifetime: number]>()
const SHARED_STRING_ID = new Map<string, StringId>()
let SHARED_STRING_INDEX = 0

function addString(value: string): StringId {
	if (SHARED_STRING_ID.has(value)) {
		const id = SHARED_STRING_ID.get(value)!
		const str = SHARED_STRING.get(id)
		if (str) {
			str[1] += 1
			return id
		}
		else {
			SHARED_STRING_ID.delete(value)
		}
	}

	++SHARED_STRING_INDEX
	SHARED_STRING.set(SHARED_STRING_INDEX, [value, 1])
	SHARED_STRING_ID.set(value, SHARED_STRING_INDEX)
	return SHARED_STRING_INDEX
}

function deleteString(stringId: StringId): void {
	if (!SHARED_STRING.has(stringId)) {
		return
	}

	const str = SHARED_STRING.get(stringId)!
	str[1] -= 1
	if (str[1] > 0) {
		return
	}

	SHARED_STRING.delete(stringId)
	SHARED_STRING_ID.delete(str[0])
}

/**
 * Represents an in-memory SQL-like table that stores data efficiently.
 * @template T - The schema type of the table.
 */
export class SQLTable<T extends Schema = any> {
	#name: TableName
	#sharedTables = new Map<SQLTable['name'], SQLTable>()
	#columnProperties = new Map<keyof T, ColumnProperties<any>>()
	#columnIndexes = new Map<keyof T, ColumnIndex>()
	#autoIncrement: number[] = []
	#rows: (number | null)[][] = []

	/**
     * Creates a new SQLTable instance.
     * @param name - The name of the table.
     * @param columns - The column definitions for the table.
     */
	constructor(name: string, columns: ColumnProperties<T>[]) {
		this.#name = name
		for (let i = 0; i < columns.length; i++) {
			const column = columns[i]
			if (!column) {
				continue
			}

			const name = column.name as string
			if (!name) {
				console.error('Column has no name')
				continue
			}

			this.#autoIncrement.push(0)
			this.#columnIndexes.set(name, i)
			this.#columnProperties.set(name, column)
		}
	}

	/** Gets the name of the table. */
	get name(): string {
		return this.#name
	}

	/** Gets an array of column names in the table. */
	get columns(): string[] {
		const cols: (keyof T)[] = []
		for (const [col, i] of this.#columnIndexes) {
			cols[i] = col
		}

		return cols.filter(v => typeof v === "string")
	}

	/** Gets the total number of rows currently stored in the table. */
	get rowCount(): number {
        return this.#rows.length
    }

	/**
	 * Gets a schema representation of the table columns and their configurations.
     * @returns The table schema.
     */
	get schema(): Record<string, {
		type: string;
		autoIncrease?: boolean;
	}> {
        const schemaInfo: Record<string, { type: string, autoIncrease?: boolean }> = {}
        for (const [colName, property] of this.#columnProperties) {
            let typeName = ''
            switch (property.type) {
			case DataTypes.Number: typeName = 'Number'; break
			case DataTypes.String: typeName = 'String'; break
			case DataTypes.Datetime: typeName = 'Datetime'; break
            }

            schemaInfo[colName as string] = {
                type: typeName,
                // Only attach autoIncrease if it's true
                ...((property as any).autoIncrease ? { autoIncrease: true } : {})
            }
        }

        return schemaInfo
    }

	/**
     * Connects other tables to this table to enable JOIN operations.
     * @param tables - An array of table instances to connect.
     */
	connectTables(tables: SQLTable[]): void {
		for (const table of tables) {
			const name = table.name
			if (name === this.#name) {
				continue
			}

			this.#sharedTables.set(name, table)
		}
	}

	/**
     * Queries the table for data, supporting filtering, joins, sorting, and limits.
     * @template JoinedTable - The resulting type when joining with another table.
     * @param [options] - The query configuration options.
     * @param [options.limit] - The maximum number of rows to return.
     * @param [options.where] - A filter function evaluated against each row.
     * @param [options.orderBy] - The column name to sort the results by.
     * @param [options.orderMode] - The direction of the sort.
     * @param [options.join] Join configurations.
     * @param [options.columns] - Specific columns to select and distinct flags.
     * @returns An array of hydrated row objects matching the query.
     */
	query<JoinedTable extends Schema = any>(options?: {
		limit?: number
		where?: (row: T) => boolean
		orderBy?: ColumnName
		orderMode?: 'ASC' | 'DESC'
		join?: {
			table: TableName
			columns?: (keyof JoinedTable)[]
			on: (currentTableValue: T, joinTableValue: JoinedTable) => boolean
		}[]
		columns?: {
			name: ColumnName,
			distinct?: boolean
		}[]
	}): T[] {
		const results: (T & JoinedTable)[] = []
		const maxRows = options?.limit ?? Infinity
		const requestedColumns = new Set(
			options?.columns?.map(col => col.name) ?? this.#columnIndexes.keys()
		)
		const distinctColumnNames = new Set(
			options?.columns?.filter(col => col.distinct).map(col => col.name)
		)
		const seenDistinctValues = new Map<ColumnName, Set<number>>()
		const hydrate = (
			targetTable: SQLTable<any>,
			rawRow: (number | null)[],
			columnsToPick: Set<string>
		) => {
			const hydratedData: Record<string, any> = {}
			for (const [colName, colIdx] of targetTable.#columnIndexes) {
				const colStr = colName as string
				if (!columnsToPick.has(colStr)) {
					continue
				}

				const rawVal = rawRow[colIdx]
				if (typeof rawVal !== 'number') {
					hydratedData[colStr] = null
					continue
				}

				const props = targetTable.#columnProperties.get(colName)!
				switch (props.type) {
					case DataTypes.Number:
						hydratedData[colStr] = rawVal
						break
					case DataTypes.String:
						hydratedData[colStr] = SHARED_STRING.get(rawVal)?.[0] ?? null
						break
					case DataTypes.Datetime:
						hydratedData[colStr] = new Date(rawVal)
						break
				}
			}

			return hydratedData
		}

		const createLazyProxy = (targetTable: SQLTable<any>, getRawRow: () => (number | null)[]) => (
			new Proxy({}, {
				get: (_, propertyName: string) => {
					const colIdx = targetTable.#columnIndexes.get(propertyName)
					if (colIdx === undefined) {
						return
					}

					const rawVal = getRawRow()[colIdx]
					if (typeof rawVal !== 'number') {
						return null
					}

					const props = targetTable.#columnProperties.get(propertyName)!
					if (props.type === DataTypes.String) {
						return SHARED_STRING.get(rawVal)?.[0] ?? null
					}

					if (props.type === DataTypes.Datetime) {
						return new Date(rawVal)
					}

					return rawVal
				}
			})
		)

		let currentRawRow: (number | null)[] = []
		const lazyRowProxy = createLazyProxy(this, () => currentRawRow) as T
		ROW_LOOP: for (let rowIndex = 0; rowIndex < this.#rows.length; rowIndex++) {
			if (results.length >= maxRows) {
				break ROW_LOOP
			}

			if (!this.#rows[rowIndex]) {
				continue
			}

			currentRawRow = this.#rows[rowIndex]!
			if (options?.where && !options.where(lazyRowProxy)) {
				continue ROW_LOOP
			}

			// DISTINCT LOGIC
			for (const distinctCol of distinctColumnNames) {
				const colIdx = this.#columnIndexes.get(distinctCol)
				if (!colIdx) {
					continue
				}

				const rawVal = currentRawRow[colIdx]
				if (typeof rawVal !== 'number') {
					continue
				}

				let seenValues = seenDistinctValues.get(distinctCol)
				if (!seenValues) {
					seenValues = new Set()
					seenDistinctValues.set(distinctCol, seenValues)
				}

				if (seenValues.has(rawVal)) {
					continue ROW_LOOP
				}

				seenValues.add(rawVal)
			}

			const baseHydratedRow = hydrate(this, currentRawRow, requestedColumns as Set<string>)
			if (!options?.join || options.join.length <= 0) {
				results.push(baseHydratedRow as (T & JoinedTable))
				continue
			}

			// INNER JOIN LOGIC
			let combinedRows: Record<string, any>[] = [baseHydratedRow]
			for (const joinConfig of options.join) {
				const joinedTable = this.#sharedTables.get(joinConfig.table)
				if (!joinedTable) {
					console.error(`Table ${joinConfig.table} not found for join.`)
					continue
				}

				const nextCombinedRows: Record<string, any>[] = []
				const joinRequestedCols = new Set(
					joinConfig.columns as string[] ?? joinedTable.#columnIndexes.keys()
				)
				let currentJoinRawRow: (number | null)[] = []
				const lazyJoinProxy = createLazyProxy(joinedTable, () => currentJoinRawRow) as JoinedTable
				for (let jRowIndex = 0; jRowIndex < joinedTable.#rows.length; jRowIndex++) {
					if (!joinedTable.#rows[jRowIndex]) {
						continue
					}

					currentJoinRawRow = joinedTable.#rows[jRowIndex]!
					if (!joinConfig.on(lazyRowProxy, lazyJoinProxy)) {
						continue
					}

					const hydratedJoinData = hydrate(joinedTable, currentJoinRawRow, joinRequestedCols)
					for (const existingRow of combinedRows) {
						nextCombinedRows.push({ ...existingRow, ...hydratedJoinData })
					}
				}

				combinedRows = nextCombinedRows
			}

			for (const finalCombinedRow of combinedRows) {
				if (results.length >= maxRows) {
					continue
				}

				results.push(finalCombinedRow as (T & JoinedTable))
			}
		}

		const sortByColumn = options?.orderBy
		if (
			!sortByColumn
			|| !this.#columnIndexes.has(sortByColumn)
			|| !requestedColumns.has(sortByColumn as string)
		) {
			return results
		}

		// SORT RESULTS
		const isDesc = options?.orderMode === 'DESC'
		results.sort((a, b) => {
			const valA = a[sortByColumn as keyof typeof a]
			const valB = b[sortByColumn as keyof typeof b]
			if (valA == null && valB == null) {
				return 0
			}

			if (valA == null) {
				return isDesc ? 1 : -1
			}

			if (valB == null) {
				return isDesc ? -1 : 1
			}

			let comparison = 0
			if (typeof valA === 'string' && typeof valB === 'string') {
				comparison = valA.localeCompare(valB)
			}
			else if (valA instanceof Date && valB instanceof Date) {
				comparison = valA.getTime() - valB.getTime()
			}
			else {
				comparison = (valA as number) - (valB as number)
			}

			return isDesc ? -comparison : comparison
		})

		return results
	}

	/**
     * Deletes rows from the table based on a condition.
     * Automatically cleans up unused strings from the shared pool.
     * @param [options] - Deletion options.
     * @param [options.limit] - The maximum number of rows to delete.
     * @param [options.where] - Condition determining which rows to delete.
     * @returns The number of rows deleted.
     */
	delete(options?: {
		limit?: number
		where?: (row: T) => boolean
	}): number {
		const maxDeletes = options?.limit ?? Infinity
		let deletedCount = 0
		if (this.#rows.length === 0) {
			return 0
		}

		let currentRawRow: (number | null)[] = []
		const lazyRowProxy = new Proxy({}, {get: (_, propertyName: string) => {
			const colIdx = this.#columnIndexes.get(propertyName)
			if (colIdx === undefined) {
				return
			}

			const rawVal = currentRawRow[colIdx]
			if (rawVal === null) {
				return null
			}

			const props = this.#columnProperties.get(propertyName)!
			switch (props.type) {
				case DataTypes.String: return SHARED_STRING.get(rawVal as number)?.[0] ?? null
				case DataTypes.Datetime: return new Date(rawVal as number)
				case DataTypes.Number: return rawVal
				default: return rawVal
			}
		}}) as T

		const keptRows: (number | null)[][] = []
		for (let rowIndex = 0; rowIndex < this.#rows.length; rowIndex++) {
			if (!this.#rows[rowIndex]) {
				continue
			}

			currentRawRow = this.#rows[rowIndex]!
			let shouldDelete = true
			if (options?.where) {
				shouldDelete = options.where(lazyRowProxy)
			}

			if (shouldDelete && deletedCount >= maxDeletes) {
				shouldDelete = false
			}

			if (!shouldDelete) {
				keptRows.push(currentRawRow)
				continue
			}

			for (const [colName, colIndex] of this.#columnIndexes) {
				const property = this.#columnProperties.get(colName)!
				const rawVal = currentRawRow[colIndex]
				if (!rawVal || property.type !== DataTypes.String) {
					continue
				}

				deleteString(rawVal as number)
			}

			deletedCount++
		}

		this.#rows = keptRows
		return deletedCount
	}

	/**
     * Updates rows in the table matching a given condition.
     * Manages string pool references when string columns are updated.
     * @param values - An array of update payloads.
     * @param where - Condition determining if a row should be updated with a payload.
     * @returns The total number of successful updates applied.
     */
	update(values: Partial<T>[], where: (updatePayload: Partial<T>, oldRow: T) => boolean): number {
        if (this.#rows.length === 0 || values.length === 0) {
			return 0
		}

        const pendingUpdates = [...values]
        let currentRawRow: (number | null)[] = []
        let updatedCount = 0
        const lazyRowProxy = new Proxy({}, {get: (_, propertyName: string) => {
			const colIdx = this.#columnIndexes.get(propertyName)
			if (colIdx === undefined) {
				return
			}

			const rawVal = currentRawRow[colIdx]
			if (typeof rawVal !== 'number') {
				return null
			}

			const props = this.#columnProperties.get(propertyName)!
			switch (props.type) {
			case DataTypes.String: return SHARED_STRING.get(rawVal)?.[0] ?? null
			case DataTypes.Datetime: return new Date(rawVal)
			case DataTypes.Number: return rawVal
			default: return rawVal
			}
		}}) as T

        ROW_LOOP: for (let rowIndex = 0; rowIndex < this.#rows.length; rowIndex++) {
            if (pendingUpdates.length === 0) {
                break ROW_LOOP
            }

			if (!this.#rows[rowIndex]) {
				continue
			}

            currentRawRow = this.#rows[rowIndex]!
            for (let vIndex = 0; vIndex < pendingUpdates.length; vIndex++) {
                const updatePayload = pendingUpdates[vIndex]
				if (!updatePayload) {
					continue
				}

				if (!where(updatePayload, lazyRowProxy)) {
					continue
				}

				for (const colName in updatePayload) {
					const colIdx = this.#columnIndexes.get(colName)
					const props = this.#columnProperties.get(colName)
					if (colIdx === undefined || !props) {
						continue
					}

					const newValue = updatePayload[colName]
					const oldRawVal = currentRawRow[colIdx]
					if (oldRawVal === undefined) {
						continue
					}

					if (newValue === null || newValue === undefined) {
						if (props.type === DataTypes.String && oldRawVal !== null) {
							deleteString(oldRawVal)
						}

						currentRawRow[colIdx] = null
						continue
					}

					switch (props.type) {
					case DataTypes.String: {
						const oldString = oldRawVal !== null ? SHARED_STRING.get(oldRawVal)?.[0] : null
						if (oldString === newValue) {
							break
						}

						if (oldRawVal !== null) {
							deleteString(oldRawVal)
						}

						currentRawRow[colIdx] = addString(newValue as string)
						break
					}
					case DataTypes.Datetime: {
						currentRawRow[colIdx] = (newValue as Date).getTime()
						break
					}
					case DataTypes.Number: {
						const numValue = newValue as number
						currentRawRow[colIdx] = numValue
						if (
							(props as any).autoIncrease
							&& numValue > (this.#autoIncrement[colIdx] ?? 0)
						) {
							this.#autoIncrement[colIdx] = numValue
						}
						break
					}}
				}

				updatedCount++
				pendingUpdates.splice(vIndex, 1)
				continue ROW_LOOP
            }
        }

        return updatedCount
    }

	/**
     * Inserts new rows into the table.
     * @param values - A single row object or an array of row objects to insert.
     * @returns An array of the newly inserted, hydrated row objects.
     */
	insert(values: Partial<T> | Partial<T>[]): T[] {
		const rowsToInsert = Array.isArray(values) ? values : [values]
		const insertedRows: T[] = []
		for (const inputValue of rowsToInsert) {
			const rawRow: (number | null)[] = new Array(this.#columnIndexes.size).fill(null)
			const hydratedRow: Record<string, any> = {}
			for (const [colName, colIndex] of this.#columnIndexes) {
				const colNameStr = colName as string
				const property = this.#columnProperties.get(colName)!
				let incomingValue = inputValue[colName]
				if (incomingValue === undefined || incomingValue === null) {
					if (
						property.type === DataTypes.Number
						&& (property as any).autoIncrease
						&& typeof this.#autoIncrement[colIndex] === 'number'
					) {
						this.#autoIncrement[colIndex] += 1
						incomingValue = this.#autoIncrement[colIndex] as any
					}
					else {
						rawRow[colIndex] = null
						hydratedRow[colNameStr] = null
						continue
					}
				}

				hydratedRow[colNameStr] = incomingValue
				switch (property.type) {
				case DataTypes.Number:
					rawRow[colIndex] = incomingValue as number
					this.#autoIncrement[colIndex] = Math.max(
						incomingValue as number,
						this.#autoIncrement[colIndex] ?? 0
					)
					break
				case DataTypes.String:
					rawRow[colIndex] = addString(incomingValue as string)
					break
				case DataTypes.Datetime:
					rawRow[colIndex] = (incomingValue as Date).getTime()
					break
				}
			}

			this.#rows.push(rawRow)
			insertedRows.push(hydratedRow as T)
		}

		return insertedRows
	}
}

/**
 * Represents a collection of connected SQLTables.
 */
export class SQLDatabase {
	#tables = new Map<SQLTable['name'], SQLTable>()
	#name: string

	/**
     * Creates a new SQLDatabase instance and links the provided tables together.
     * @param tables - The table instances to include in the database.
     */
	constructor(name: string, ...tables: SQLTable[]) {
		this.#name = name
		for (const table of tables) {
			this.#tables.set(table.name, table)
			table.connectTables(tables)
		}
	}

	/**
	 * Get database name
	 */
	get name(): string {
		return this.#name
	}

	/**
	 * Gets an array of all table names registered in the database.
     * @returns {string[]}
     */
	get tableNames(): string[] {
        return Array.from(this.#tables.keys())
    }

	/**
     * Retrieves a table instance by its name.
     * @template T - The schema type of the requested table.
     * @param name - The name of the table to retrieve.
     * @returns The requested table, or undefined if not found.
     */
    getTable<T extends Schema = any>(name: string): SQLTable<T> | undefined {
        return this.#tables.get(name) as SQLTable<T> | undefined
    }
}