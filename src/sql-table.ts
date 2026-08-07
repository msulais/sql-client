import { sharedStringPool } from './string-pool.js'
import {
	DataTypes,
	type Schema,
	type ColumnsConfig,
	type InferRow,
	type InsertRow,
	type MergeJoins,
} from './types.js'

type ColumnIndex = number
type RawRow = (number | null)[]

/**
 * Represents an in-memory SQL-like table that stores data efficiently.
 * @template T - The schema type of the table.
 * @template C - The literal type of the column configurations.
 */
export class SQLTable<
	T extends Schema = any,
	const C extends ColumnsConfig<T> = ColumnsConfig<T>
> {
	private _columnProperties = new Map<keyof T, any>()
	private _columnIndexes    = new Map<keyof T, ColumnIndex>()
	private _autoIncrementCounters: number[] = []
	private _rows: RawRow[] = []

	/**
	 * Creates a new SQLTable instance.
	 * @param columns - The column definitions for the table.
	 */
	constructor(columns: C) {

		let i = 0
		for (const key in columns) {
			const column = columns[key]
			if (!column) continue

			this._autoIncrementCounters.push(0)
			this._columnIndexes.set(key, i)
			this._columnProperties.set(key, column)
			i++
		}
	}

	// ---------------------------------------------------------------------------
	// Public getters
	// ---------------------------------------------------------------------------

	/** Gets an array of column names in the table, in column order. */
	get columns(): string[] {
		const cols = Array.from<string>({ length: this._columnIndexes.size })
		for (const [col, idx] of this._columnIndexes) {
			cols[idx] = col as string
		}
		return cols
	}

	/** Gets the total number of rows currently stored in the table. */
	get rowCount(): number {
		return this._rows.length
	}

	/**
	 * Gets a schema representation of the table columns and their configurations.
	 * @returns The table schema.
	 */
	get schema(): Record<string, { type: string; autoIncrement?: boolean }> {
		const schemaInfo: Record<string, { type: string; autoIncrement?: boolean }> = {}

		for (const [colName, property] of this._columnProperties) {
			let typeName = ''
			switch (property.type) {
			case DataTypes.Number:   typeName = 'Number';   break
			case DataTypes.String:   typeName = 'String';   break
			case DataTypes.Datetime: typeName = 'Datetime'; break
			}

			schemaInfo[colName as string] = {
				type: typeName,
				// Only attach autoIncrement if it's true
				...((property as any).autoIncrement ? { autoIncrement: true } : {})
			}
		}

		return schemaInfo
	}

	// ---------------------------------------------------------------------------
	// Private helpers
	// ---------------------------------------------------------------------------

	/**
	 * Converts a raw numeric row into a plain JS object, deserializing each value
	 * according to its column type. Only columns present in `columnsToPick` are
	 * included in the result.
	 */
	private _hydrateRow(
		sourceTable: SQLTable<any, any>,
		rawRow: RawRow,
		columnsToPick: Set<string>
	): Record<string, any> {
		const hydratedRow: Record<string, any> = {}

		for (const [colName, colIdx] of sourceTable._columnIndexes) {
			const colStr = colName as string
			if (!columnsToPick.has(colStr)) continue

			const rawVal = rawRow[colIdx]
			if (typeof rawVal !== 'number') {
				hydratedRow[colStr] = null
				continue
			}

			const props = sourceTable._columnProperties.get(colName)!
			switch (props.type) {
			case DataTypes.Number:
				hydratedRow[colStr] = rawVal
				break
			case DataTypes.String:
				hydratedRow[colStr] = sharedStringPool.get(rawVal)
				break
			case DataTypes.Datetime:
				hydratedRow[colStr] = new Date(rawVal)
				break
			}
		}

		return hydratedRow
	}

	/**
	 * Returns a `Proxy` that lazily deserializes individual columns on property
	 * access. Used in `where` / `on` callbacks so we avoid hydrating the entire
	 * row when only a few columns are touched.
	 */
	private _createLazyProxy(
		sourceTable: SQLTable<any, any>,
		getRawRow: () => RawRow
	): Record<string, any> {
		return new Proxy({}, {
			get: (_, propertyName: string) => {
				const colIdx = sourceTable._columnIndexes.get(propertyName)
				if (colIdx === undefined) return null

				const rawVal = getRawRow()[colIdx]
				if (typeof rawVal !== 'number') return null

				const props = sourceTable._columnProperties.get(propertyName)!
				switch (props.type) {
				case DataTypes.String:   return sharedStringPool.get(rawVal)
				case DataTypes.Datetime: return new Date(rawVal)
				default:                 return rawVal
				}
			}
		})
	}

	/**
	 * Writes a single typed value into `rawRow[colIdx]`, managing the string pool
	 * lifecycle for `String` columns. Returns the serialized raw value that was
	 * stored, or `undefined` when the write is skipped.
	 */
	private _setRawValue(
		rawRow: RawRow,
		colIdx: ColumnIndex,
		props: any,
		newValue: any,
		oldRawVal: number | null | undefined
	): void {
		if (newValue === null) {
			if (props.type === DataTypes.String && oldRawVal !== null && oldRawVal !== undefined) {
				sharedStringPool.release(oldRawVal)
			}
			rawRow[colIdx] = null
			return
		}

		switch (props.type) {
		case DataTypes.String: {
			const oldString = (oldRawVal != null) ? sharedStringPool.get(oldRawVal) : null
			if (oldString === newValue) break // No-op: same string, skip pool churn

			if (oldRawVal != null) sharedStringPool.release(oldRawVal)
			rawRow[colIdx] = sharedStringPool.add(newValue as string)
			break
		}
		case DataTypes.Datetime:
			rawRow[colIdx] = (newValue as Date).getTime()
			break
		case DataTypes.Number: {
			const numValue = newValue as number
			rawRow[colIdx] = numValue
			if ((props as any).autoIncrement && numValue > (this._autoIncrementCounters[colIdx] ?? 0)) {
				this._autoIncrementCounters[colIdx] = numValue
			}
			break
		}
		}
	}

	// ---------------------------------------------------------------------------
	// Public CRUD methods
	// ---------------------------------------------------------------------------

	/**
	 * Queries the table for data, supporting filtering, joins, sorting, limits, and offsets.
	 * @template JoinTables - The array of SQLTable instances being joined.
	 * @template JoinedRows - The inferred row types of the joined tables.
	 * @param [options] - The query configuration options.
	 * @returns An array of hydrated row objects matching the query.
	 */
	query<
		JoinTables extends SQLTable<any, any>[] = [],
		JoinedRows extends any[] = { [K in keyof JoinTables]: JoinTables[K] extends SQLTable<infer JT, infer JC> ? InferRow<JT, JC> : never },
		SelectedCols extends keyof MergeJoins<InferRow<T, C>, JoinedRows> = keyof MergeJoins<InferRow<T, C>, JoinedRows>
	>(options?: {
		limit?: number
		offset?: number
		where?: (row: InferRow<T, C>) => boolean
		orderBy?: keyof MergeJoins<InferRow<T, C>, JoinedRows>
		orderDirection?: 'ASC' | 'DESC'
		join?: readonly [...{
			[K in keyof JoinTables]: JoinTables[K] extends SQLTable<infer JT, infer JC> ? {
				table: JoinTables[K]
				columns?: (keyof InferRow<JT, JC>)[]
				on: (currentValue: InferRow<T, C>, joinTableValue: InferRow<JT, JC>) => boolean
			} : never
		}]
		columns?: {
			name: keyof T,
			distinct?: boolean
		}[]
	}): Pick<MergeJoins<InferRow<T, C>, JoinedRows>, SelectedCols>[] {
		const results: any[] = []
		const limit    = options?.limit  ?? Infinity
		const offset   = options?.offset ?? 0
		const maxLimit = limit === Infinity ? Infinity : (limit + offset)

		const hasOrderBy = !!options?.orderBy
		const requestedColumns = new Set(
			options?.columns?.map(col => col.name as string) ?? this._columnIndexes.keys()
		)
		const distinctColumnNames = new Set(
			options?.columns?.filter(col => col.distinct).map(col => col.name)
		)
		const seenDistinctValues = new Map<keyof T, Set<number>>()

		let currentRawRow: RawRow = []
		const lazyRowProxy = this._createLazyProxy(this, () => currentRawRow) as InferRow<T, C>

		ROW_LOOP: for (let rowIndex = 0; rowIndex < this._rows.length; rowIndex++) {
			if (!hasOrderBy && results.length >= maxLimit) break ROW_LOOP
			if (!this._rows[rowIndex]) continue

			currentRawRow = this._rows[rowIndex]!
			if (options?.where && !options.where(lazyRowProxy)) continue ROW_LOOP

			// DISTINCT logic
			for (const distinctCol of distinctColumnNames) {
				const colIdx = this._columnIndexes.get(distinctCol as keyof T)
				if (!colIdx) continue

				const rawVal = currentRawRow[colIdx]
				if (typeof rawVal !== 'number') continue

				let seenValues = seenDistinctValues.get(distinctCol)
				if (!seenValues) {
					seenValues = new Set()
					seenDistinctValues.set(distinctCol, seenValues)
				}

				if (seenValues.has(rawVal)) continue ROW_LOOP
				seenValues.add(rawVal)
			}

			const baseHydratedRow = this._hydrateRow(this, currentRawRow, requestedColumns as Set<string>)

			if (!options?.join || options.join.length <= 0) {
				results.push(baseHydratedRow)
				if (!hasOrderBy && results.length >= maxLimit) break ROW_LOOP
				continue
			}

			// INNER JOIN logic
			let combinedRows: Record<string, any>[] = [baseHydratedRow]
			for (const joinConfig of options.join) {
				const joinedTable = joinConfig.table as SQLTable<any, any>
				if (!joinedTable) continue

				const nextCombinedRows: Record<string, any>[] = []
				const joinRequestedCols = new Set(
					joinConfig.columns as string[] ?? joinedTable._columnIndexes.keys()
				)
				let currentJoinRawRow: RawRow = []
				const lazyJoinProxy = this._createLazyProxy(joinedTable, () => currentJoinRawRow)

				for (let jRowIndex = 0; jRowIndex < joinedTable._rows.length; jRowIndex++) {
					if (!joinedTable._rows[jRowIndex]) continue

					currentJoinRawRow = joinedTable._rows[jRowIndex]!
					if (!joinConfig.on(lazyRowProxy, lazyJoinProxy as any)) continue

					const hydratedJoinRow = this._hydrateRow(joinedTable, currentJoinRawRow, joinRequestedCols)
					for (const existingRow of combinedRows) {
						nextCombinedRows.push({ ...existingRow, ...hydratedJoinRow })
					}
				}

				combinedRows = nextCombinedRows
			}

			for (const finalCombinedRow of combinedRows) {
				results.push(finalCombinedRow)
				if (!hasOrderBy && results.length >= maxLimit) break ROW_LOOP
			}
		}

		// Sorting
		const sortByColumn = options?.orderBy
		const canSort = sortByColumn && (
			this._columnIndexes.has(sortByColumn as keyof T)
			|| requestedColumns.has(sortByColumn as string)
		)
		if (canSort) {
			const isDesc = options?.orderDirection === 'DESC'
			results.sort((a, b) => {
				const valA = a[sortByColumn as keyof typeof a]
				const valB = b[sortByColumn as keyof typeof b]
				if (valA == null && valB == null) return 0
				if (valA == null) return isDesc ? 1 : -1
				if (valB == null) return isDesc ? -1 : 1

				let comparison = 0
				if (typeof valA === 'string' && typeof valB === 'string') {
					comparison = valA.localeCompare(valB)
				} else if (valA instanceof Date && valB instanceof Date) {
					comparison = valB.getTime() - valA.getTime()
				} else {
					comparison = (valA as number) - (valB as number)
				}
				return isDesc ? -comparison : comparison
			})
		}

		const stronglyTypedResults = results as Pick<MergeJoins<InferRow<T, C>, JoinedRows>, SelectedCols>[]

		if (limit === Infinity && offset === 0) return stronglyTypedResults

		return limit === Infinity
			? stronglyTypedResults.slice(offset)
			: stronglyTypedResults.slice(offset, offset + limit)
	}

	/**
	 * Deletes rows from the table based on a condition.
	 * Automatically cleans up unused strings from the shared pool.
	 * @param [options] - Deletion options.
	 * @param [options.limit] - The maximum number of rows to delete.
	 * @param [options.where] - Condition determining which rows to delete.
	 * @returns The deleted items.
	 */
	delete(options?: {
		limit?: number
		where?: (value: InferRow<T, C>) => boolean
	}): InferRow<T, C>[] {
		if (this._rows.length === 0) return []

		const maxDeletes = options?.limit ?? Infinity
		let deletedCount = 0

		let currentRawRow: RawRow = []
		const lazyRowProxy = this._createLazyProxy(this, () => currentRawRow) as InferRow<T, C>

		const remainingRows: RawRow[] = []
		const deletedRows: InferRow<T, C>[] = []

		for (let rowIndex = 0; rowIndex < this._rows.length; rowIndex++) {
			if (!this._rows[rowIndex]) continue

			currentRawRow = this._rows[rowIndex]!
			let shouldDelete = options?.where ? options.where(lazyRowProxy) : true

			if (shouldDelete && deletedCount >= maxDeletes) {
				shouldDelete = false
			}

			if (!shouldDelete) {
				remainingRows.push(currentRawRow)
				continue
			}

			// Hydrate the deleted row and release string pool references
			const hydratedRow: InferRow<T, C> = {} as InferRow<T, C>
			for (const [colName, colIndex] of this._columnIndexes) {
				const property = this._columnProperties.get(colName)!
				const rawVal   = currentRawRow[colIndex]
				hydratedRow[colName as keyof typeof hydratedRow] = null as any

				if (rawVal === null) continue

				switch (property.type) {
				case DataTypes.Number:
					hydratedRow[colName as keyof typeof hydratedRow] = rawVal as any
					break
				case DataTypes.String:
					hydratedRow[colName as keyof typeof hydratedRow] = sharedStringPool.get(rawVal) as any
					sharedStringPool.release(rawVal)
					break
				case DataTypes.Datetime:
					hydratedRow[colName as keyof typeof hydratedRow] = new Date(rawVal) as any
					break
				}
			}

			deletedRows.push(hydratedRow)
			deletedCount++
		}

		this._rows = remainingRows
		return deletedRows
	}

	/**
	 * Updates rows in the table matching a given condition.
	 * Manages string pool references when string columns are updated.
	 * @param values - An array of update payloads.
	 * @param where - Condition determining if a row should be updated with a payload.
	 * @param map - Optional function to transform the update payload based on the existing row data before applying the update. Skipped if `where` returns `false`.
	 * @returns The updated items.
	 */
	update(
		values: Partial<InferRow<T, C>>[],
		where: (newValue: Partial<InferRow<T, C>>, oldValue: InferRow<T, C>) => boolean,
		map?: (newValue: Partial<InferRow<T, C>>, oldValue: InferRow<T, C>) => Partial<InferRow<T, C>>
	): InferRow<T, C>[] {
		if (this._rows.length === 0 || values.length === 0) return []

		const pendingUpdates = [...values]
		let currentRawRow: RawRow = []
		const lazyRowProxy = this._createLazyProxy(this, () => currentRawRow) as InferRow<T, C>

		const updatedRows: InferRow<T, C>[] = []

		for (let rowIndex = 0; rowIndex < this._rows.length; rowIndex++) {
			if (pendingUpdates.length === 0) break
			if (!this._rows[rowIndex]) continue

			currentRawRow = this._rows[rowIndex]!
			let isUpdated = false

			for (let vIndex = 0; vIndex < pendingUpdates.length; vIndex++) {
				const updatePayload = pendingUpdates[vIndex]
				if (!updatePayload) continue
				if (!where(updatePayload, lazyRowProxy)) continue

				const finalPayload = map ? map(updatePayload, lazyRowProxy) : updatePayload
				for (const colName in finalPayload) {
					const colIdx = this._columnIndexes.get(colName)
					const props  = this._columnProperties.get(colName)
					if (colIdx === undefined || !props) continue

					const newValue  = finalPayload[colName as keyof typeof finalPayload]
					const oldRawVal = currentRawRow[colIdx]
					if (oldRawVal === undefined || newValue === undefined) continue

					this._setRawValue(currentRawRow, colIdx, props, newValue, oldRawVal)
				}

				pendingUpdates.splice(vIndex, 1)
				isUpdated = true
				break
			}

			if (isUpdated) {
				updatedRows.push(this._hydrateRow(this, currentRawRow, new Set(this._columnIndexes.keys() as Iterable<string>)) as InferRow<T, C>)
			}
		}

		return updatedRows
	}

	/**
	 * Inserts new rows into the table, or updates them if a conflict occurs on the specified key.
	 * @param values - A single row object or an array of row objects to insert.
	 * @param conflictKey - Optional column name to check for conflicts (UPSERT).
	 * @param onConflict - Optional callback to determine if the update should proceed when a conflict is found.
	 * @param onUpdateMap - Optional callback to transform the update payload based on the existing row data before applying the update. Skipped if `onConflict` returns `false`.
	 * @returns An array of the newly inserted or updated hydrated row objects.
	 */
	insert(
		values: InsertRow<T, C> | InsertRow<T, C>[],
		conflictKey?: keyof T,
		onConflict?: (newValue: InsertRow<T, C>, oldValue: InferRow<T, C>) => boolean,
		onUpdateMap?: (newValue: InsertRow<T, C>, oldValue: InferRow<T, C>) => Partial<InferRow<T, C>>
	): InferRow<T, C>[] {
		const rowsToInsert = Array.isArray(values) ? values : [values]
		const insertedRows: InferRow<T, C>[] = []
		let itemsToInsert = rowsToInsert

		UPDATE: {
			if (!conflictKey) break UPDATE

			const potentialUpdates = rowsToInsert.filter(v =>
				v[conflictKey as keyof typeof v] !== undefined
				&& v[conflictKey as keyof typeof v] !== null
			)
			if (potentialUpdates.length <= 0) break UPDATE

			const matchedConflictValues = new Set<any>()
			const updatedRows = this.update(
				potentialUpdates as Partial<InferRow<T, C>>[],
				(payload, oldRow) => {
					const keyNew = payload[conflictKey as keyof typeof payload]
					const keyOld = oldRow[conflictKey as keyof typeof oldRow]
					if (
						keyOld === null
						|| (oldRow instanceof Date && keyNew instanceof Date && oldRow.getTime() !== keyNew.getTime())
						|| keyOld !== keyNew
					) {
						return false
					}

					matchedConflictValues.add(keyNew)
					return onConflict?.(payload as any, oldRow) ?? true
				},
				onUpdateMap as any
			)

			insertedRows.push(...updatedRows)
			itemsToInsert = rowsToInsert.filter(v =>
				v[conflictKey as keyof typeof v] === undefined
				|| v[conflictKey as keyof typeof v] === null
				|| !matchedConflictValues.has(v[conflictKey as keyof typeof v])
			)
		}

		const allColumnKeys = new Set(this._columnIndexes.keys() as Iterable<string>)

		for (const inputValue of itemsToInsert) {
			const rawRow: RawRow = new Array(this._columnIndexes.size).fill(null)
			const hydratedRow: Record<string, any> = {}

			for (const [colName, colIndex] of this._columnIndexes) {
				const colNameStr = colName as string
				const property  = this._columnProperties.get(colName)!
				let incomingValue = inputValue[colName as keyof typeof inputValue]

				if (incomingValue === undefined || incomingValue === null) {
					if (
						property.type === DataTypes.Number
						&& (property as any).autoIncrement
						&& typeof this._autoIncrementCounters[colIndex] === 'number'
					) {
						this._autoIncrementCounters[colIndex] += 1
						incomingValue = this._autoIncrementCounters[colIndex] as any
					} else {
						rawRow[colIndex] = null
						hydratedRow[colNameStr] = null
						continue
					}
				}

				// Sentinel auto-increment: if the provided value for an autoIncrement
				// column is less than the current counter, treat it as a trigger and
				// assign the next auto-increment value instead.
				// This lets callers use -1 (or any sub-counter value) as a sentinel
				// when TypeScript requires a concrete number but they want auto-assign.
				if (
					property.type === DataTypes.Number
					&& (property as any).autoIncrement
					&& (incomingValue as number) <= this._autoIncrementCounters[colIndex]
				) {
					this._autoIncrementCounters[colIndex] += 1
					incomingValue = this._autoIncrementCounters[colIndex] as any
				}

				hydratedRow[colNameStr] = incomingValue
				switch (property.type) {
				case DataTypes.Number:
					rawRow[colIndex] = incomingValue as number
					this._autoIncrementCounters[colIndex] = Math.max(
						incomingValue as number,
						this._autoIncrementCounters[colIndex] ?? 0
					)
					break
				case DataTypes.String:
					rawRow[colIndex] = sharedStringPool.add(incomingValue as string)
					break
				case DataTypes.Datetime:
					rawRow[colIndex] = (incomingValue as Date).getTime()
					break
				}
			}

			this._rows.push(rawRow)
			insertedRows.push(hydratedRow as InferRow<T, C>)
		}

		return insertedRows
	}
}