/**
 * Defines the supported data types for table columns.
 */
export enum DataTypes {
	Number,
	String,
	Datetime,
}

/** Make all properties in T nullable */
export type Nullable<T> = {
	[P in keyof T]: T[P] | null
}

/** Column name (string) */
export type ColumnName = string

/** Table schema */
export type Schema = Record<ColumnName, number | string | Date | null>

/** Column configuration object */
export type ColumnsConfig<T extends Schema> = {
	[K in keyof T]: { nullable?: boolean } & (
		{ type: DataTypes.String | DataTypes.Datetime }
		| { type: DataTypes.Number, autoIncrement?: boolean }
	)
}

/**
 * Dynamically infers the row type.
 * If a column has { nullable: true }, it becomes `T[K] | null`. Otherwise, it is strictly `T[K]`.
 */
export type InferRow<T extends Schema, C> = {
	[K in keyof T]: C extends any
		? K extends keyof C
			? C[K] extends { nullable: true }
				? T[K] | null
				: null extends T[K] ? T[K] : NonNullable<T[K]>
			: null extends T[K] ? T[K] : NonNullable<T[K]>
		: never
}

export type OptionalInsertCols<C> = {
	[K in keyof C]: C[K] extends { autoIncrement: true } | { nullable: true } ? K : never
}[keyof C] & keyof C

export type InsertRow<T extends Schema, C> =
	Omit<InferRow<T, C>, OptionalInsertCols<C> & keyof T> & Partial<Pick<InferRow<T, C>, OptionalInsertCols<C> & keyof T>>

/** Join array */
export type MergeJoins<T extends Schema, J extends any[]> = (J extends [infer First, ...infer Rest]
    ? First & MergeJoins<T, Rest>
    : T
)
