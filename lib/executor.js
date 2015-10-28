var semver = require('semver');
var debug = require('debug')('loopback:boot:executor');
var async = require('async');
var path = require('path');
var format = require('util').format;

/**
 * Execute bootstrap instructions gathered by `boot.compile`.
 *
 * @param {Object} app The loopback app to boot.
 * @options {Object} instructions Boot instructions.
 * @param {Function} [callback] Callback function.
 *
 * @header boot.execute(instructions)
 */

module.exports = function execute(app, instructions, callback) {
  callback = callback || function() {};

  app.booting = true;
  setHost(app, instructions);
  setPort(app, instructions);
  setApiRoot(app, instructions);
  applyAppConfig(app, instructions);

  setupDataSources(app, instructions);
  setupModels(app, instructions);

  // Run the boot scripts in series synchronously or asynchronously
  // Please note async supports both styles
  async.series([
    function(done) {
      runBootScripts(app, instructions, done);
    }], function(err) {
      app.booting = false;

      if (err) return callback(err);

      app.emit('booted');

      callback();
    });
};

function setHost(app, instructions) {
  var host =instructions.config.host;

  if (host !== undefined) {
    app.set('host', host);
  }
}

function setPort(app, instructions) {
  // jscs:disable requireCamelCaseOrUpperCaseIdentifiers
  var port = instructions.config.port || 3000;

  if (port !== undefined) {
    app.set('port', port);
  }
}

function setApiRoot(app, instructions) {
  var restApiRoot = instructions.config.restApiRoot || '/api';
  app.set('restApiRoot', restApiRoot);
}

function applyAppConfig(app, instructions) {
  var appConfig = instructions.config;
  for (var configKey in appConfig) {
    var cur = app.get(configKey);
    if (cur === undefined || cur === null) {
      app.set(configKey, appConfig[configKey]);
    }
  }
}

function setupDataSources(app, instructions) {
  forEachKeyedObject(instructions.dataSources, function(key, obj) {
    app.dataSource(key, obj);
  });
}

function setupModels(app, instructions) {
  defineMixins(app, instructions);
  defineModels(app, instructions);

  instructions.models.forEach(function(data) {
    // Skip base models that are not exported to the app
    if (!data.config) return;

    app.model(data._model, data.config);
  });
}

function defineMixins(app, instructions) {
  var modelBuilder = (app.registry || app.loopback).modelBuilder;
  var BaseClass = app.loopback.Model;
  var mixins = instructions.mixins || [];

  if (!modelBuilder.mixins || !mixins.length) return;

  mixins.forEach(function(obj) {
    var mixin = require(obj.sourceFile);

    if (typeof mixin === 'function' || mixin.prototype instanceof BaseClass) {
      debug('Defining mixin %s', obj.name);
      modelBuilder.mixins.define(obj.name, mixin); // TODO (name, mixin, meta)
    } else {
      debug('Skipping mixin file %s - `module.exports` is not a function' +
        ' or Loopback model', obj);
    }
  });
}

function defineModels(app, instructions) {
  var registry = app.registry || app.loopback;
  instructions.models.forEach(function(data) {
    var name = data.name;
    var model;

    if (!data.definition) {
      model = registry.getModel(name);
      if (!model) {
        throw new Error('Cannot configure unknown model ' + name);
      }
      debug('Configuring existing model %s', name);
    } else if (isBuiltinLoopBackModel(app, data)) {
      model = registry.getModel(name);
      debug('Configuring built-in LoopBack model %s', name);
    } else {
      debug('Creating new model %s %j', name, data.definition);
      model = registry.createModel(data.definition);
      if (data.sourceFile) {
        debug('Loading customization script %s', data.sourceFile);
        var code = require(data.sourceFile);
        if (typeof code === 'function') {
          debug('Customizing model %s', name);
          code(model);
        } else {
          debug('Skipping model file %s - `module.exports` is not a function',
            data.sourceFile);
        }
      }
    }

    data._model = model;
  });
}

// Regular expression to match built-in loopback models
var LOOPBACK_MODEL_REGEXP = new RegExp(
  ['', 'node_modules', 'loopback', '[^\\/\\\\]+', 'models', '[^\\/\\\\]+\\.js$']
    .join('\\' + path.sep));

function isBuiltinLoopBackModel(app, data) {
  // 1. Built-in models are exposed on the loopback object
  if (!app.loopback[data.name]) return false;

  // 2. Built-in models have a script file `loopback/{facet}/models/{name}.js`
  var srcFile = data.sourceFile;
  return srcFile &&
    LOOPBACK_MODEL_REGEXP.test(srcFile);
}

function forEachKeyedObject(obj, fn) {
  if (typeof obj !== 'object') return;

  Object.keys(obj).forEach(function(key) {
    fn(key, obj[key]);
  });
}

function runScripts(app, list, callback) {
  list = list || [];
  var functions = [];
  list.forEach(function(filepath) {
    debug('Requiring script %s', filepath);
    try {
      var exports = require(filepath);
      if (typeof exports === 'function') {
        debug('Exported function detected %s', filepath);
        functions.push({
          path: filepath,
          func: exports
        });
      }
    } catch (err) {
      console.error('Failed loading boot script: %s\n%s', filepath, err.stack);
      throw err;
    }
  });

  async.eachSeries(functions, function(f, done) {
    debug('Running script %s', f.path);
    if (f.func.length >= 2) {
      debug('Starting async function %s', f.path);
      f.func(app, function(err) {
        debug('Async function finished %s', f.path);
        done(err);
      });
    } else {
      debug('Starting sync function %s', f.path);
      f.func(app);
      debug('Sync function finished %s', f.path);
      done();
    }
  }, callback);
}

function runBootScripts(app, instructions, callback) {
  runScripts(app, instructions.files.boot, callback);
}