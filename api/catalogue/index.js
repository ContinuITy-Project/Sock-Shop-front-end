(function (){
  'use strict';

  var express   = require("express")
    , originalRequest   = require("request")
    , endpoints = require("../endpoints")
    , helpers   = require("../../helpers")
    , app       = express()

    var serviceName = "front-end-remotecall";
    var remoteServiceName = "catalogue";

    const wrapRequest = require('zipkin-instrumentation-request');
    
    const zipkinMiddleware = require('zipkin-instrumentation-express').expressMiddleware;
    const {Tracer, BatchRecorder, CountingSampler, jsonEncoder: {JSON_V2}} = require('zipkin');
  const zipkin = require("zipkin");
  
  var _require = require('zipkin'),
  _require$option = _require.option,
  Some = _require$option.Some,
  None = _require$option.None,
  Instrumentation = _require.Instrumentation;

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
  
  var url = require('url');


  function formatRequestUrl(req) {
    var parsed = url.parse(req.originalUrl);
    return url.format({
      protocol: req.protocol,
      host: req.get('host'),
      pathname: parsed.pathname,
      search: parsed.search
    });
  }
  var instrumentation = new Instrumentation.HttpServer({ tracer: tracer, serviceName: "front-end", port: 0 });
  app.get("/catalogue/images*", function (req, res, next) {
    tracer.scoped(function () {
      function readHeader(header) {
        var val = req.header(header);
        if (val != null) {
          return new Some(val);
        } else {
          return None;
        }
      }
    var id = instrumentation.recordRequest(req.method, formatRequestUrl(req), readHeader);
    var url = endpoints.catalogueUrl + req.url.toString();
    
    var request = wrapRequest(originalRequest, {tracer, serviceName, remoteServiceName});

    request.get(url)
        .on('error', function(e) { next(e); })
        .pipe(res);
    instrumentation.recordResponse(id, res.statusCode);
  });
});

  app.get("/catalogue*", function (req, res, next) {
    tracer.scoped(function () {
    function readHeader(header) {
      var val = req.header(header);
      if (val != null) {
        return new Some(val);
      } else {
        return None;
      }
    }
    var id = instrumentation.recordRequest(req.method, formatRequestUrl(req), readHeader);

    helpers.simpleHttpRequest(endpoints.catalogueUrl + req.url.toString(), res, next, tracer, id, instrumentation);
    });
  });

  app.get("/tags", function(req, res, next) {
   tracer.scoped(function () {
    function readHeader(header) {
      var val = req.header(header);
      if (val != null) {
        return new Some(val);
      } else {
        return None;
      }
    }
    
    var id = instrumentation.recordRequest(req.method, formatRequestUrl(req), readHeader);
    helpers.simpleHttpRequest(endpoints.tagsUrl, res, next, tracer, id, instrumentation);
    });
  });

  module.exports = app;
}());
