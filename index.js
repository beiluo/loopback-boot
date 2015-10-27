var compile = require('./lib/compiler');
var execute = require('./lib/executor');

module.exports = function bootLoopBackApp(app, options, callback) {
  var instructions = compile(options);
  execute(app, instructions, callback);
};