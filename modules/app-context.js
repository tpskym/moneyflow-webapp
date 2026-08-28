export function createAppContext({ elements, state, storage }) {
  const actions = new Map();
  return Object.freeze({
    elements,
    state,
    storage: Object.freeze({
      read: storage.read,
      write: storage.write,
      keys: Object.freeze({ ...storage.keys }),
    }),
    actions: Object.freeze({
      call(name, ...args) {
        const action = actions.get(name);
        if (!action) throw new Error(`Не зарегистрировано действие: ${name}`);
        return action(...args);
      },
      register(name, action) {
        if (!name || typeof action !== "function") throw new TypeError("Некорректное действие приложения");
        actions.set(name, action);
      },
    }),
  });
}
