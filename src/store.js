const TODOS = "todos";

const openDatabase = (name) =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(TODOS, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const readAll = (db) =>
  new Promise((resolve, reject) => {
    const request = db.transaction(TODOS).objectStore(TODOS).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const copy = (value) => JSON.parse(JSON.stringify(value));

/**
 * Creates a new client side storage object backed by IndexedDB. Todos are
 * loaded once into memory so reads stay synchronous; every change is written
 * through to IndexedDB.
 *
 * @param {string} name The name of our DB we want to use
 * @param {function} callback Fires with all todos once they are loaded
 */
export class Store {
  constructor(name, callback) {
    this._todos = [];
    this._db = null;

    openDatabase(name)
      .then(async (db) => {
        this._db = db;
        this._todos = await readAll(db);
      })
      .catch((error) => {
        // Without IndexedDB (private mode, blocked storage) todos live in memory only.
        console.warn("IndexedDB unavailable, todos will not survive a reload.", error);
      })
      .then(() => {
        if (callback) callback(copy(this._todos));
      });
  }

  _write(change) {
    if (this._db) change(this._db.transaction(TODOS, "readwrite").objectStore(TODOS));
  }

  /**
   * Finds items based on a query given as a JS object
   *
   * @param {object} query The query to match against (i.e. {foo: 'bar'})
   * @param {function} callback   The callback to fire when the query has
   * completed running
   *
   * @example
   * db.find({foo: 'bar', hello: 'world'}, function (data) {
   *   // data will return any items that have foo: bar and
   *   // hello: world in their properties
   * })
   */
  find(query, callback) {
    if (!callback) return;

    callback(
      copy(this._todos).filter((todo) => {
        for (let q in query) {
          if (query[q] !== todo[q]) return false;
        }

        return true;
      }),
    );
  }

  /**
   * Will retrieve all data from the collection
   *
   * @param {function} callback The callback to fire upon retrieving data
   */
  findAll(callback) {
    if (!callback) return;

    callback(copy(this._todos));
  }

  /**
   * Will save the given data to the DB. If no item exists it will create a new
   * item, otherwise it'll simply update an existing item's properties
   *
   * @param {object} updateData The data to save back into the DB
   * @param {function} callback The callback to fire after saving
   * @param {number} id An optional param to enter an ID of an item to update
   */
  save(updateData, callback, id) {
    const todos = this._todos;

    // If an ID was actually given, find the item and update each property
    if (id) {
      for (let i = 0; i < todos.length; i++) {
        if (todos[i].id === id) {
          for (let key in updateData) todos[i][key] = updateData[key];

          this._write((objectStore) => objectStore.put(todos[i]));
          break;
        }
      }

      if (callback) callback(copy(todos));
    } else {
      // Continue after the highest stored ID so reloads never reuse one.
      updateData.id = todos.reduce((max, todo) => Math.max(max, todo.id), 0) + 1;

      todos.push(copy(updateData));
      this._write((objectStore) => objectStore.put(updateData));

      if (callback) callback([updateData]);
    }
  }

  /**
   * Will remove an item from the Store based on its ID
   *
   * @param {number} id The ID of the item you want to remove
   * @param {function} callback The callback to fire after saving
   */
  remove(id, callback) {
    const todos = this._todos;

    for (let i = 0; i < todos.length; i++) {
      if (todos[i].id === id) {
        todos.splice(i, 1);
        break;
      }
    }

    this._write((objectStore) => objectStore.delete(id));

    if (callback) callback(copy(todos));
  }

  /**
   * Will drop all storage and start fresh
   *
   * @param {function} callback The callback to fire after dropping the data
   */
  drop(callback) {
    this._todos = [];
    this._write((objectStore) => objectStore.clear());

    if (callback) callback([]);
  }
}

export default Store;
