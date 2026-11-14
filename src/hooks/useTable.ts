import { useLiveQuery } from 'dexie-react-hooks'
import { db, type TableName } from '@/database/db'

// Live data hook: the component re-renders automatically whenever the table changes.
// Returns `undefined` while loading the first time (use this to show a loading state).
export function useTable<T>(name: TableName): T[] | undefined {
  return useLiveQuery(() => db[name].toArray() as Promise<unknown>, [name]) as T[] | undefined
}
