import View from "./view";
import Controller from "./controller";
import Model from "./model";
import Store from "./store";
import Template from "./template";

import "todomvc-app-css/index.css";
import "todomvc-common/base.css";

let todo;
const onHashChange = () => {
  todo.controller.setView(document.location.hash);
};

// Render only after the store has loaded the saved todos from IndexedDB.
const onLoad = () => {
  todo = new Todo("workshop-todos", () => {
    onHashChange();
    window.addEventListener("hashchange", onHashChange);
  });
};

function Todo(name, onReady) {
  this.storage = new Store(name, onReady);
  this.model = new Model(this.storage);
  this.template = new Template();
  this.view = new View(this.template);
  this.controller = new Controller(this.model, this.view);
}

onLoad();
