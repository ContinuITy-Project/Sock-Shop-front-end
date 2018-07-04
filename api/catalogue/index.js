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
    
    const zipkinMiddleware = require('zipkin-instrumentation-express').expressMiddleware;
    const {Tracer, BatchRecorder, CountingSampler, jsonEncoder: {JSON_V2}} = require('zipkin');
  const zipkin = require("zipkin");
  
  const CLSContext = require('zipkin-context-cls');
  const ctxImpl = new CLSContext('catalogue');
  const {HttpLogger} = require('zipkin-transport-http');

  var port = process.env.ZIPKIN_PORT;
  var host = process.env.ZIPKIN_HOST;
  const zipkinUrl = `http://${host}:${port}`;

  const recorder = new BatchRecorder({
    logger: new HttpLogger({
      endpoint: `${zipkinUrl}/rest/api/v2/spans`,
      jsonEncoder: JSON_V2
    })
  });

  const tracer = new Tracer({
    ctxImpl,
    recorder: recorder,
    localServiceName: serviceName,
    sampler: new zipkin.sampler.CountingSampler(1), // sample rate 0.01 will sample 1 % of all incoming requests
    traceId128Bit: false // to generate 128-bit trace IDs.
  });
  app.use(zipkinMiddleware({tracer}));
  app.get("/catalogue/images*", function (req, res, next) {
    var url = endpoints.catalogueUrl + req.url.toString();
    
    var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});
    tracer.local('pay-me', () => {

    request.get(url)
        .on('error', function(e) { next(e); })
        .pipe(res);
    });
  });

  app.get("/catalogue*", function (req, res, next) {
    helpers.simpleHttpRequest(endpoints.catalogueUrl + req.url.toString(), res, next, tracer);
  });

  app.get("/tags", function(req, res, next) {
    helpers.simpleHttpRequest(endpoints.tagsUrl, res, next, tracer);
  });

  module.exports = app;
}());
