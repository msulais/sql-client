"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var _SQLTable_name, _SQLTable_sharedTables, _SQLTable_columnProperties, _SQLTable_columnIndexes, _SQLTable_autoIncrement, _SQLTable_rows, _SQLDatabase_tables;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQLDatabase = exports.SQLTable = exports.DataTypes = void 0;
var DataTypes;
(function (DataTypes) {
    DataTypes[DataTypes["Number"] = 0] = "Number";
    DataTypes[DataTypes["String"] = 1] = "String";
    DataTypes[DataTypes["Datetime"] = 2] = "Datetime";
})(DataTypes || (exports.DataTypes = DataTypes = {}));
// (2 string + 3 (8*3 Bytes) number) memory = each string
var SHARED_STRING = new Map();
var SHARED_STRING_ID = new Map();
var SHARED_STRING_INDEX = 0;
function addString(value) {
    if (SHARED_STRING_ID.has(value)) {
        var id = SHARED_STRING_ID.get(value);
        var str = SHARED_STRING.get(id);
        if (str) {
            str[1] += 1;
            return id;
        }
        else {
            SHARED_STRING_ID.delete(value);
        }
    }
    ++SHARED_STRING_INDEX;
    SHARED_STRING.set(SHARED_STRING_INDEX, [value, 1]);
    SHARED_STRING_ID.set(value, SHARED_STRING_INDEX);
    return SHARED_STRING_INDEX;
}
function deleteString(stringId) {
    if (!SHARED_STRING.has(stringId)) {
        return;
    }
    var str = SHARED_STRING.get(stringId);
    str[1] -= 1;
    if (str[1] > 0) {
        return;
    }
    SHARED_STRING.delete(stringId);
    SHARED_STRING_ID.delete(str[0]);
}
var SQLTable = /** @class */ (function () {
    /**
     * Creates a new SQLTable instance.
     * @param name - The name of the table.
     * @param columns - The column definitions for the table.
     */
    function SQLTable(name, columns) {
        _SQLTable_name.set(this, void 0);
        _SQLTable_sharedTables.set(this, new Map());
        _SQLTable_columnProperties.set(this, new Map());
        _SQLTable_columnIndexes.set(this, new Map());
        _SQLTable_autoIncrement.set(this, []);
        _SQLTable_rows.set(this, []
        /**
         * Creates a new SQLTable instance.
         * @param name - The name of the table.
         * @param columns - The column definitions for the table.
         */
        );
        __classPrivateFieldSet(this, _SQLTable_name, name, "f");
        for (var i = 0; i < columns.length; i++) {
            var column = columns[i];
            if (!column) {
                continue;
            }
            var name_1 = column.name;
            if (!name_1) {
                console.error('Column has no name');
                continue;
            }
            __classPrivateFieldGet(this, _SQLTable_autoIncrement, "f").push(0);
            __classPrivateFieldGet(this, _SQLTable_columnIndexes, "f").set(name_1, i);
            __classPrivateFieldGet(this, _SQLTable_columnProperties, "f").set(name_1, column);
        }
    }
    Object.defineProperty(SQLTable.prototype, "name", {
        get: function () {
            return __classPrivateFieldGet(this, _SQLTable_name, "f");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(SQLTable.prototype, "columns", {
        get: function () {
            var cols = [];
            for (var _i = 0, _a = __classPrivateFieldGet(this, _SQLTable_columnIndexes, "f"); _i < _a.length; _i++) {
                var _b = _a[_i], col = _b[0], i = _b[1];
                cols[i] = col;
            }
            return cols.filter(function (v) { return typeof v === "string"; });
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(SQLTable.prototype, "rowCount", {
        get: function () {
            return __classPrivateFieldGet(this, _SQLTable_rows, "f").length;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(SQLTable.prototype, "schema", {
        /**
         * Gets a schema representation of the table columns and their configurations.
         * @returns The table schema.
         */
        get: function () {
            var schemaInfo = {};
            for (var _i = 0, _a = __classPrivateFieldGet(this, _SQLTable_columnProperties, "f"); _i < _a.length; _i++) {
                var _b = _a[_i], colName = _b[0], property = _b[1];
                var typeName = '';
                switch (property.type) {
                    case DataTypes.Number:
                        typeName = 'Number';
                        break;
                    case DataTypes.String:
                        typeName = 'String';
                        break;
                    case DataTypes.Datetime:
                        typeName = 'Datetime';
                        break;
                }
                schemaInfo[colName] = __assign({ type: typeName }, (property.autoIncrease ? { autoIncrease: true } : {}));
            }
            return schemaInfo;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Connects other tables to this table to enable JOIN operations.
     * @param tables - An array of table instances to connect.
     */
    SQLTable.prototype.connectTables = function (tables) {
        for (var _i = 0, tables_1 = tables; _i < tables_1.length; _i++) {
            var table = tables_1[_i];
            var name_2 = table.name;
            if (name_2 === __classPrivateFieldGet(this, _SQLTable_name, "f")) {
                continue;
            }
            __classPrivateFieldGet(this, _SQLTable_sharedTables, "f").set(name_2, table);
        }
    };
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
    SQLTable.prototype.query = function (options) {
        var _a, _b, _c, _d, _e;
        var results = [];
        var maxRows = (_a = options === null || options === void 0 ? void 0 : options.limit) !== null && _a !== void 0 ? _a : Infinity;
        var requestedColumns = new Set((_c = (_b = options === null || options === void 0 ? void 0 : options.columns) === null || _b === void 0 ? void 0 : _b.map(function (col) { return col.name; })) !== null && _c !== void 0 ? _c : __classPrivateFieldGet(this, _SQLTable_columnIndexes, "f").keys());
        var distinctColumnNames = new Set((_d = options === null || options === void 0 ? void 0 : options.columns) === null || _d === void 0 ? void 0 : _d.filter(function (col) { return col.distinct; }).map(function (col) { return col.name; }));
        var seenDistinctValues = new Map();
        var hydrate = function (targetTable, rawRow, columnsToPick) {
            var _a, _b;
            var hydratedData = {};
            for (var _i = 0, _c = __classPrivateFieldGet(targetTable, _SQLTable_columnIndexes, "f"); _i < _c.length; _i++) {
                var _d = _c[_i], colName = _d[0], colIdx = _d[1];
                var colStr = colName;
                if (!columnsToPick.has(colStr)) {
                    continue;
                }
                var rawVal = rawRow[colIdx];
                if (typeof rawVal !== 'number') {
                    hydratedData[colStr] = null;
                    continue;
                }
                var props = __classPrivateFieldGet(targetTable, _SQLTable_columnProperties, "f").get(colName);
                switch (props.type) {
                    case DataTypes.Number:
                        hydratedData[colStr] = rawVal;
                        break;
                    case DataTypes.String:
                        hydratedData[colStr] = (_b = (_a = SHARED_STRING.get(rawVal)) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : null;
                        break;
                    case DataTypes.Datetime:
                        hydratedData[colStr] = new Date(rawVal);
                        break;
                }
            }
            return hydratedData;
        };
        var createLazyProxy = function (targetTable, getRawRow) { return (new Proxy({}, {
            get: function (_, propertyName) {
                var _a, _b;
                var colIdx = __classPrivateFieldGet(targetTable, _SQLTable_columnIndexes, "f").get(propertyName);
                if (colIdx === undefined) {
                    return;
                }
                var rawVal = getRawRow()[colIdx];
                if (typeof rawVal !== 'number') {
                    return null;
                }
                var props = __classPrivateFieldGet(targetTable, _SQLTable_columnProperties, "f").get(propertyName);
                if (props.type === DataTypes.String) {
                    return (_b = (_a = SHARED_STRING.get(rawVal)) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : null;
                }
                if (props.type === DataTypes.Datetime) {
                    return new Date(rawVal);
                }
                return rawVal;
            }
        })); };
        var currentRawRow = [];
        var lazyRowProxy = createLazyProxy(this, function () { return currentRawRow; });
        ROW_LOOP: for (var rowIndex = 0; rowIndex < __classPrivateFieldGet(this, _SQLTable_rows, "f").length; rowIndex++) {
            if (results.length >= maxRows) {
                break ROW_LOOP;
            }
            if (!__classPrivateFieldGet(this, _SQLTable_rows, "f")[rowIndex]) {
                continue;
            }
            currentRawRow = __classPrivateFieldGet(this, _SQLTable_rows, "f")[rowIndex];
            if ((options === null || options === void 0 ? void 0 : options.where) && !options.where(lazyRowProxy)) {
                continue ROW_LOOP;
            }
            // DISTINCT LOGIC
            for (var _i = 0, distinctColumnNames_1 = distinctColumnNames; _i < distinctColumnNames_1.length; _i++) {
                var distinctCol = distinctColumnNames_1[_i];
                var colIdx = __classPrivateFieldGet(this, _SQLTable_columnIndexes, "f").get(distinctCol);
                if (!colIdx) {
                    continue;
                }
                var rawVal = currentRawRow[colIdx];
                if (typeof rawVal !== 'number') {
                    continue;
                }
                var seenValues = seenDistinctValues.get(distinctCol);
                if (!seenValues) {
                    seenValues = new Set();
                    seenDistinctValues.set(distinctCol, seenValues);
                }
                if (seenValues.has(rawVal)) {
                    continue ROW_LOOP;
                }
                seenValues.add(rawVal);
            }
            var baseHydratedRow = hydrate(this, currentRawRow, requestedColumns);
            if (!(options === null || options === void 0 ? void 0 : options.join) || options.join.length <= 0) {
                results.push(baseHydratedRow);
                continue;
            }
            // INNER JOIN LOGIC
            var combinedRows = [baseHydratedRow];
            var _loop_1 = function (joinConfig) {
                var joinedTable = __classPrivateFieldGet(this_1, _SQLTable_sharedTables, "f").get(joinConfig.table);
                if (!joinedTable) {
                    console.error("Table ".concat(joinConfig.table, " not found for join."));
                    return "continue";
                }
                var nextCombinedRows = [];
                var joinRequestedCols = new Set((_e = joinConfig.columns) !== null && _e !== void 0 ? _e : __classPrivateFieldGet(joinedTable, _SQLTable_columnIndexes, "f").keys());
                var currentJoinRawRow = [];
                var lazyJoinProxy = createLazyProxy(joinedTable, function () { return currentJoinRawRow; });
                for (var jRowIndex = 0; jRowIndex < __classPrivateFieldGet(joinedTable, _SQLTable_rows, "f").length; jRowIndex++) {
                    if (!__classPrivateFieldGet(joinedTable, _SQLTable_rows, "f")[jRowIndex]) {
                        continue;
                    }
                    currentJoinRawRow = __classPrivateFieldGet(joinedTable, _SQLTable_rows, "f")[jRowIndex];
                    if (!joinConfig.on(lazyRowProxy, lazyJoinProxy)) {
                        continue;
                    }
                    var hydratedJoinData = hydrate(joinedTable, currentJoinRawRow, joinRequestedCols);
                    for (var _j = 0, combinedRows_2 = combinedRows; _j < combinedRows_2.length; _j++) {
                        var existingRow = combinedRows_2[_j];
                        nextCombinedRows.push(__assign(__assign({}, existingRow), hydratedJoinData));
                    }
                }
                combinedRows = nextCombinedRows;
            };
            var this_1 = this;
            for (var _f = 0, _g = options.join; _f < _g.length; _f++) {
                var joinConfig = _g[_f];
                _loop_1(joinConfig);
            }
            for (var _h = 0, combinedRows_1 = combinedRows; _h < combinedRows_1.length; _h++) {
                var finalCombinedRow = combinedRows_1[_h];
                if (results.length >= maxRows) {
                    continue;
                }
                results.push(finalCombinedRow);
            }
        }
        var sortByColumn = options === null || options === void 0 ? void 0 : options.orderBy;
        if (!sortByColumn
            || !__classPrivateFieldGet(this, _SQLTable_columnIndexes, "f").has(sortByColumn)
            || !requestedColumns.has(sortByColumn)) {
            return results;
        }
        // SORT RESULTS
        var isDesc = (options === null || options === void 0 ? void 0 : options.orderMode) === 'DESC';
        results.sort(function (a, b) {
            var valA = a[sortByColumn];
            var valB = b[sortByColumn];
            if (valA == null && valB == null) {
                return 0;
            }
            if (valA == null) {
                return isDesc ? 1 : -1;
            }
            if (valB == null) {
                return isDesc ? -1 : 1;
            }
            var comparison = 0;
            if (typeof valA === 'string' && typeof valB === 'string') {
                comparison = valA.localeCompare(valB);
            }
            else if (valA instanceof Date && valB instanceof Date) {
                comparison = valA.getTime() - valB.getTime();
            }
            else {
                comparison = valA - valB;
            }
            return isDesc ? -comparison : comparison;
        });
        return results;
    };
    /**
     * Deletes rows from the table based on a condition.
     * Automatically cleans up unused strings from the shared pool.
     * @param [options] - Deletion options.
     * @param [options.limit] - The maximum number of rows to delete.
     * @param [options.where] - Condition determining which rows to delete.
     * @returns The number of rows deleted.
     */
    SQLTable.prototype.delete = function (options) {
        var _this = this;
        var _a;
        var maxDeletes = (_a = options === null || options === void 0 ? void 0 : options.limit) !== null && _a !== void 0 ? _a : Infinity;
        var deletedCount = 0;
        if (__classPrivateFieldGet(this, _SQLTable_rows, "f").length === 0) {
            return 0;
        }
        var currentRawRow = [];
        var lazyRowProxy = new Proxy({}, { get: function (_, propertyName) {
                var _a, _b;
                var colIdx = __classPrivateFieldGet(_this, _SQLTable_columnIndexes, "f").get(propertyName);
                if (colIdx === undefined) {
                    return;
                }
                var rawVal = currentRawRow[colIdx];
                if (rawVal === null) {
                    return null;
                }
                var props = __classPrivateFieldGet(_this, _SQLTable_columnProperties, "f").get(propertyName);
                switch (props.type) {
                    case DataTypes.String: return (_b = (_a = SHARED_STRING.get(rawVal)) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : null;
                    case DataTypes.Datetime: return new Date(rawVal);
                    case DataTypes.Number: return rawVal;
                    default: return rawVal;
                }
            } });
        var keptRows = [];
        for (var rowIndex = 0; rowIndex < __classPrivateFieldGet(this, _SQLTable_rows, "f").length; rowIndex++) {
            if (!__classPrivateFieldGet(this, _SQLTable_rows, "f")[rowIndex]) {
                continue;
            }
            currentRawRow = __classPrivateFieldGet(this, _SQLTable_rows, "f")[rowIndex];
            var shouldDelete = true;
            if (options === null || options === void 0 ? void 0 : options.where) {
                shouldDelete = options.where(lazyRowProxy);
            }
            if (shouldDelete && deletedCount >= maxDeletes) {
                shouldDelete = false;
            }
            if (!shouldDelete) {
                keptRows.push(currentRawRow);
                continue;
            }
            for (var _i = 0, _b = __classPrivateFieldGet(this, _SQLTable_columnIndexes, "f"); _i < _b.length; _i++) {
                var _c = _b[_i], colName = _c[0], colIndex = _c[1];
                var property = __classPrivateFieldGet(this, _SQLTable_columnProperties, "f").get(colName);
                var rawVal = currentRawRow[colIndex];
                if (!rawVal || property.type !== DataTypes.String) {
                    continue;
                }
                deleteString(rawVal);
            }
            deletedCount++;
        }
        __classPrivateFieldSet(this, _SQLTable_rows, keptRows, "f");
        return deletedCount;
    };
    /**
     * Updates rows in the table matching a given condition.
     * Manages string pool references when string columns are updated.
     * @param values - An array of update payloads.
     * @param where - Condition determining if a row should be updated with a payload.
     * @returns The total number of successful updates applied.
     */
    SQLTable.prototype.update = function (values, where) {
        var _this = this;
        var _a, _b;
        if (__classPrivateFieldGet(this, _SQLTable_rows, "f").length === 0 || values.length === 0) {
            return 0;
        }
        var pendingUpdates = __spreadArray([], values, true);
        var currentRawRow = [];
        var updatedCount = 0;
        var lazyRowProxy = new Proxy({}, { get: function (_, propertyName) {
                var _a, _b;
                var colIdx = __classPrivateFieldGet(_this, _SQLTable_columnIndexes, "f").get(propertyName);
                if (colIdx === undefined) {
                    return;
                }
                var rawVal = currentRawRow[colIdx];
                if (typeof rawVal !== 'number') {
                    return null;
                }
                var props = __classPrivateFieldGet(_this, _SQLTable_columnProperties, "f").get(propertyName);
                switch (props.type) {
                    case DataTypes.String: return (_b = (_a = SHARED_STRING.get(rawVal)) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : null;
                    case DataTypes.Datetime: return new Date(rawVal);
                    case DataTypes.Number: return rawVal;
                    default: return rawVal;
                }
            } });
        ROW_LOOP: for (var rowIndex = 0; rowIndex < __classPrivateFieldGet(this, _SQLTable_rows, "f").length; rowIndex++) {
            if (pendingUpdates.length === 0) {
                break ROW_LOOP;
            }
            if (!__classPrivateFieldGet(this, _SQLTable_rows, "f")[rowIndex]) {
                continue;
            }
            currentRawRow = __classPrivateFieldGet(this, _SQLTable_rows, "f")[rowIndex];
            for (var vIndex = 0; vIndex < pendingUpdates.length; vIndex++) {
                var updatePayload = pendingUpdates[vIndex];
                if (!updatePayload) {
                    continue;
                }
                if (!where(updatePayload, lazyRowProxy)) {
                    continue;
                }
                for (var colName in updatePayload) {
                    var colIdx = __classPrivateFieldGet(this, _SQLTable_columnIndexes, "f").get(colName);
                    var props = __classPrivateFieldGet(this, _SQLTable_columnProperties, "f").get(colName);
                    if (colIdx === undefined || !props) {
                        continue;
                    }
                    var newValue = updatePayload[colName];
                    var oldRawVal = currentRawRow[colIdx];
                    if (oldRawVal === undefined) {
                        continue;
                    }
                    if (newValue === null || newValue === undefined) {
                        if (props.type === DataTypes.String && oldRawVal !== null) {
                            deleteString(oldRawVal);
                        }
                        currentRawRow[colIdx] = null;
                        continue;
                    }
                    switch (props.type) {
                        case DataTypes.String: {
                            var oldString = oldRawVal !== null ? (_a = SHARED_STRING.get(oldRawVal)) === null || _a === void 0 ? void 0 : _a[0] : null;
                            if (oldString === newValue) {
                                break;
                            }
                            if (oldRawVal !== null) {
                                deleteString(oldRawVal);
                            }
                            currentRawRow[colIdx] = addString(newValue);
                            break;
                        }
                        case DataTypes.Datetime: {
                            currentRawRow[colIdx] = newValue.getTime();
                            break;
                        }
                        case DataTypes.Number: {
                            var numValue = newValue;
                            currentRawRow[colIdx] = numValue;
                            if (props.autoIncrease
                                && numValue > ((_b = __classPrivateFieldGet(this, _SQLTable_autoIncrement, "f")[colIdx]) !== null && _b !== void 0 ? _b : 0)) {
                                __classPrivateFieldGet(this, _SQLTable_autoIncrement, "f")[colIdx] = numValue;
                            }
                            break;
                        }
                    }
                }
                updatedCount++;
                pendingUpdates.splice(vIndex, 1);
                continue ROW_LOOP;
            }
        }
        return updatedCount;
    };
    /**
     * Inserts new rows into the table.
     * @param values - A single row object or an array of row objects to insert.
     * @returns An array of the newly inserted, hydrated row objects.
     */
    SQLTable.prototype.insert = function (values) {
        var _a;
        var rowsToInsert = Array.isArray(values) ? values : [values];
        var insertedRows = [];
        for (var _i = 0, rowsToInsert_1 = rowsToInsert; _i < rowsToInsert_1.length; _i++) {
            var inputValue = rowsToInsert_1[_i];
            var rawRow = new Array(__classPrivateFieldGet(this, _SQLTable_columnIndexes, "f").size).fill(null);
            var hydratedRow = {};
            for (var _b = 0, _c = __classPrivateFieldGet(this, _SQLTable_columnIndexes, "f"); _b < _c.length; _b++) {
                var _d = _c[_b], colName = _d[0], colIndex = _d[1];
                var colNameStr = colName;
                var property = __classPrivateFieldGet(this, _SQLTable_columnProperties, "f").get(colName);
                var incomingValue = inputValue[colName];
                if (incomingValue === undefined || incomingValue === null) {
                    if (property.type === DataTypes.Number
                        && property.autoIncrease
                        && typeof __classPrivateFieldGet(this, _SQLTable_autoIncrement, "f")[colIndex] === 'number') {
                        __classPrivateFieldGet(this, _SQLTable_autoIncrement, "f")[colIndex] += 1;
                        incomingValue = __classPrivateFieldGet(this, _SQLTable_autoIncrement, "f")[colIndex];
                    }
                    else {
                        rawRow[colIndex] = null;
                        hydratedRow[colNameStr] = null;
                        continue;
                    }
                }
                hydratedRow[colNameStr] = incomingValue;
                switch (property.type) {
                    case DataTypes.Number:
                        rawRow[colIndex] = incomingValue;
                        __classPrivateFieldGet(this, _SQLTable_autoIncrement, "f")[colIndex] = Math.max(incomingValue, (_a = __classPrivateFieldGet(this, _SQLTable_autoIncrement, "f")[colIndex]) !== null && _a !== void 0 ? _a : 0);
                        break;
                    case DataTypes.String:
                        rawRow[colIndex] = addString(incomingValue);
                        break;
                    case DataTypes.Datetime:
                        rawRow[colIndex] = incomingValue.getTime();
                        break;
                }
            }
            __classPrivateFieldGet(this, _SQLTable_rows, "f").push(rawRow);
            insertedRows.push(hydratedRow);
        }
        return insertedRows;
    };
    return SQLTable;
}());
exports.SQLTable = SQLTable;
_SQLTable_name = new WeakMap(), _SQLTable_sharedTables = new WeakMap(), _SQLTable_columnProperties = new WeakMap(), _SQLTable_columnIndexes = new WeakMap(), _SQLTable_autoIncrement = new WeakMap(), _SQLTable_rows = new WeakMap();
var SQLDatabase = /** @class */ (function () {
    function SQLDatabase() {
        var tables = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            tables[_i] = arguments[_i];
        }
        _SQLDatabase_tables.set(this, new Map());
        for (var _a = 0, tables_2 = tables; _a < tables_2.length; _a++) {
            var table = tables_2[_a];
            __classPrivateFieldGet(this, _SQLDatabase_tables, "f").set(table.name, table);
            table.connectTables(tables);
        }
    }
    Object.defineProperty(SQLDatabase.prototype, "tableNames", {
        get: function () {
            return Array.from(__classPrivateFieldGet(this, _SQLDatabase_tables, "f").keys());
        },
        enumerable: false,
        configurable: true
    });
    SQLDatabase.prototype.getTable = function (name) {
        return __classPrivateFieldGet(this, _SQLDatabase_tables, "f").get(name);
    };
    return SQLDatabase;
}());
exports.SQLDatabase = SQLDatabase;
_SQLDatabase_tables = new WeakMap();
