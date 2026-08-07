type StringId = number

/**
 * An intern pool for strings.
 * Each unique string is stored once and reference-counted.
 * Storing strings as numeric IDs in raw rows saves memory and enables O(1) lookups.
 */
export class StringPool {
	// Map from StringId → [string value, reference count]
	private _byId   = new Map<StringId, [value: string, refCount: number]>()
	// Map from string value → StringId (reverse index for deduplication)
	private _byValue = new Map<string, StringId>()
	private _nextId  = 0

	/**
	 * Interns a string in the pool, incrementing its reference count.
	 * @returns The numeric ID for the string.
	 */
	add(value: string): StringId {
		if (this._byValue.has(value)) {
			const id = this._byValue.get(value)!
			const entry = this._byId.get(id)
			if (entry) {
				entry[1] += 1
				return id
			}
			// Stale reverse-index entry — clean it up and re-intern
			this._byValue.delete(value)
		}

		const id = ++this._nextId
		this._byId.set(id, [value, 1])
		this._byValue.set(value, id)
		return id
	}

	/**
	 * Decrements the reference count for a string ID.
	 * Removes the entry from the pool when the count reaches zero.
	 */
	release(id: StringId): void {
		const entry = this._byId.get(id)
		if (!entry) return

		entry[1] -= 1
		if (entry[1] > 0) return

		this._byId.delete(id)
		this._byValue.delete(entry[0])
	}

	/**
	 * Looks up the string for a given ID.
	 * @returns The string value, or `null` if the ID is not in the pool.
	 */
	get(id: StringId): string | null {
		return this._byId.get(id)?.[0] ?? null
	}
}

/** Module-level singleton shared across all SQLTable instances. */
export const sharedStringPool = new StringPool()
