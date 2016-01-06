var async = require('async');
var express = require('express');
var bodyParser = require('body-parser');

var config = require(__dirname + '/config.js');
var r = require('rethinkdbdash')(config.rethinkdb);

var app = express();


//For serving the index.html and all the other front-end assets.
app.use(express.static(__dirname + '/public'));

app.use(bodyParser.json());

//The REST routes for "todos".
app.route('/todos')
  .get(listTodoItems)
  .post(createTodoItem);

app.route('/todos/:id')
  .get(getTodoItem)
  .put(updateTodoItem)
  .delete(deleteTodoItem);

//If we reach this middleware the route could not be handled and must be unknown.
app.use(handle404);

//Generic error handling middleware.
app.use(handleError);


/*
 * Retrieve all todo items.
 */
function listTodoItems(req, res, next) {
  r.table('todos').orderBy({index: 'createdAt'}).run().then(function (result) {
    //Retrieve all the todos in an array.
    res.json(result);
  }).error(next);
}

/*
 * Insert a new todo item.
 */
function createTodoItem(req, res, next) {
  var todoItem = req.body;
  todoItem.createdAt = r.now();

  console.dir(todoItem);

  r.table('todos').insert(todoItem, {returnChanges: true}).run().then(function (result) {
    res.json(result.changes[0].new_val);
  }).error(next);
}

/*
 * Get a specific todo item.
 */
function getTodoItem(req, res, next) {
  var todoItemID = req.params.id;

  r.table('todos').get(todoItemID).run().then(function(result) {
    res.json(result);
  }).error(next);
}

/*
 * Update a todo item.
 */
function updateTodoItem(req, res, next) {
  var todoItem = req.body;
  var todoItemID = req.params.id;

  r.table('todos').get(todoItemID).update(todoItem, {returnChanges: true}).
   run().then(function(result) {
    res.json(result.changes[0].new_val);
  }).error(next);
}

/*
 * Delete a todo item.
 */
function deleteTodoItem(req, res, next) {
  var todoItemID = req.params.id;

  r.table('todos').get(todoItemID).delete().run().then(function(result) {
    res.json({success: true});
  }).error(next);
}

/*
 * Page-not-found middleware.
 */
function handle404(req, res, next) {
  res.status(404).end('not found');
}

/*
 * Generic error handling middleware.
 * Send back a 500 page and log the error to the console.
 */
function handleError(err, req, res, next) {
  console.error(err.stack);
  res.status(500).json({err: err.message});
}

/*
 * Store the db connection and start listening on a port.
 */
function startExpress() {
  app.listen(config.express.port);
  console.log('Listening on port ' + config.express.port);
}

/*
 * Connect to rethinkdb, create the needed tables/indexes and then start express.
 * Create tables/indexes then start express
 */
async.waterfall([
  function createDatabase(callback) {
    //Create the database if needed.
    r.dbList().contains(config.rethinkdb.db).do(function(containsDb) {
      return r.branch(
        containsDb,
        r.expr('ok'),
        r.dbCreate(config.rethinkdb.db)
      );
    }).run().then(function(res) {
      callback(null);
    }).error(callback);
  },
  function createTable(callback) {
    //Create the table if needed.
    r.tableList().contains('todos').do(function(containsTable) {
      return r.branch(
        containsTable,
        r.expr('ok'),
        r.tableCreate('todos')
      );
    }).run().then(function(res) {
      callback(null);
    }).error(callback);
  },
  function createIndex(callback) {
    //Create the index if needed.
    r.table('todos').indexList().contains('createdAt').do(function(hasIndex) {
      return r.branch(
        hasIndex,
        r.expr('ok'),
        r.table('todos').indexCreate('createdAt')
      );
    }).run().then(function(res) {
      callback(null);
    }).error(callback);
  },
  function waitForIndex(callback) {
    //Wait for the index to be ready.
    r.table('todos').indexWait('createdAt').run().then(function (res) {
      callback(null);
    }).error(callback);
  }
], function(err) {
  if(err) {
    console.error(err);
    process.exit(1);
    return;
  }

  startExpress();
});
