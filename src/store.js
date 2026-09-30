const API = "/api/todos";

const request = async (method, path = "", body) => {
  const options = { method };
  if (body) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API}${path}`, options);

  if (!response.ok) throw new Error(`${method} ${API}${path} failed with ${response.status}`);

  return response.status === 204 ? undefined : response.json();
};

const copy = (value) => JSON.parse(JSON.stringify(value));

/**
 * Creates a client side storage object backed by the server's todo API.
 * Todos are loaded into memory so reads stay synchronous; every change is
 * sent to the server, one request at a time and in order.
 *
 * @param {string} name Unused, kept so the Store API stays the same
 * @param {function} callback Fires with all todos each time they are
 * loaded from the server: once on start, and again after a failed save
 */
export class Store {
  constructor(name, callback) {
    this._todos = [];
    this._onLoad = callback;
    this._writes = Promise.resolve();

    this._load();
  }

  _load() {
    return request("GET")
      .then((todos) => {
        this._todos = todos;
      })
      .catch((error) => console.error("Could not load todos from the server.", error))
      .then(() => {
        if (this._onLoad) this._onLoad(copy(this._todos));
      });
  }

  // A failed save reloads from the server so the page never shows
  // something the server doesn't have.
  _sync(method, path, body) {
    const write = this._writes.then(() => request(method, path, body));

    this._writes = write.catch((error) => {
      console.error("Could not save to the server, reloading todos.", error);
      return this._load();
    });

    return write;
  }

  /**
   * Resolves once every pending change has reached the server.
   */
  whenSaved() {
    return this._writes;
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

          this._sync("PATCH", `/${id}`, updateData);
          break;
        }
      }

      if (callback) callback(copy(todos));
    } else {
      // New todos wait for the server, which hands out the ID.
      this._sync("POST", "", updateData).then(
        (todo) => {
          this._todos.push(todo);
          if (callback) callback([copy(todo)]);
        },
        () => {}, // _sync already logged it and reloaded
      );
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
        this._sync("DELETE", `/${id}`);
        break;
      }
    }

    if (callback) callback(copy(todos));
  }

  /**
   * Will drop all storage and start fresh
   *
   * @param {function} callback The callback to fire after dropping the data
   */
  drop(callback) {
    this._todos = [];
    this._sync("DELETE");

    if (callback) callback([]);
  }
}

export default Store;
