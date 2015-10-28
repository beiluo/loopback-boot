var compile = require('./lib/compiler');
var execute = require('./lib/executor');
var _ = require('lodash');
var request = require('request');
module.exports = function bootLoopBackApp(app, options, callback) {
	options = options || {};

  if (typeof options === 'string') {
    options = { appRootDir: options };
  }
  getConfigFromMiddle("A6962135466109",function(err,config){
  	var instructions = compile(_.merge(options,config));
  	execute(app, instructions, callback);
  })  
};

function getConfigFromMiddle(appId,callback){
  var options={
    url:"http://127.0.0.1/explorer/getConfig",
    method:"POST",
    json:true,
    headers:{
      "X-APICloud-AppId":"A6962135466109"
    }
  }
  request(options,function(err,res,body){
    callback(err,body.result);
  })
}