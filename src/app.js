import View from "./view";
import Controller from "./controller";
import Model from "./model";
import Store from "./store";
import Template from "./template";

import "todomvc-app-css/index.css";
import "todomvc-common/base.css";
import "./app.css";

let todo;
const onHashChange = () => {
  todo.controller.setView(document.location.hash);
};

// Render each time the store loads todos from the server.
const onLoad = () => {
  todo = new Todo("workshop-todos", onHashChange);
  window.addEventListener("hashchange", onHashChange);
};

function Todo(name, onLoaded) {
  this.storage = new Store(name, onLoaded);
  this.model = new Model(this.storage);
  this.template = new Template();
  this.view = new View(this.template);
  this.controller = new Controller(this.model, this.view);
}

onLoad();
