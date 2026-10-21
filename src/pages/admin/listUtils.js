// Small immutable helpers shared by the wizard steps.

export const patchItem = (list, id, changes) => list.map((x) => (x.id === id ? { ...x, ...changes } : x))

export const removeItem = (list, id) => list.filter((x) => x.id !== id)

export const toNumber = (value, min = 0) => Math.max(min, Number.parseInt(value, 10) || 0)
