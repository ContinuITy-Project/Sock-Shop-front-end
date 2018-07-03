(function (){
  'use strict';

  var express   = require("express")
    , originalRequest   = require("request")
    , endpoints = require("../endpoints")
    , helpers   = require("../../helpers")
    , app       = express()

    var serviceName = "frontend-remotecall";
    var remoteServiceName = "catalogue";

    const wrapRequest = require('zipkin-instrumentation-request');

  app.get("/catalogue/images*", function (req, res, next) {
    var url = endpoints.catalogueUrl + req.url.toString();
    
    var tracer = global.tracer;
    var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});
    
    request.get(url)
        .on('error', function(e) { next(e); })
        .pipe(res);
  });

  app.get("/catalogue*", function (req, res, next) {
    helpers.simpleHttpRequest(endpoints.catalogueUrl + req.url.toString(), res, next);
  });

  app.get("/tags", function(req, res, next) {
    helpers.simpleHttpRequest(endpoints.tagsUrl, res, next);
  });

  module.exports = app;
}());
